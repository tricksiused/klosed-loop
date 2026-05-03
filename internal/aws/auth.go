package aws

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"github.com/aws/smithy-go"
	"gopkg.in/ini.v1"
)

// VerifyAuth checks if the current environment has valid AWS credentials
// by attempting to call sts:GetCallerIdentity.
func (c *Client) VerifyAuth(ctx context.Context) (bool, error) {
	if IsTestMode() {
		return true, nil
	}

	// 1. Use existing client config (which has correct Profile/Region)
	stsClient := sts.NewFromConfig(c.Cfg)
	_, err := stsClient.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	if err != nil {
		// Return the error so the caller knows why auth failed
		return false, err
	}
	creds, err := c.Cfg.Credentials.Retrieve(ctx)
	if err != nil {
		return false, err
	}
	return creds.HasKeys(), nil
}

// VerifyPermissions checks if the current credentials have necessary permissions.
// It returns a list of missing permissions (if any) and an error if the check itself failed.
func (c *Client) VerifyPermissions(ctx context.Context) (missing []string, identity string, err error) {
	// 1. Get Identity (and check basic auth)
	stsClient := sts.NewFromConfig(c.Cfg)
	id, err := stsClient.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	if err != nil {
		return nil, "", fmt.Errorf("auth check failed: %w", err)
	}
	identityArg := ""
	if id.Arn != nil {
		identityArg = *id.Arn
	}

	// 2. Define permissions to check via DryRun
	var missingPerms []string

	check := func(name string, f func() error) {
		if !isDryRunError(f()) {
			missingPerms = append(missingPerms, name)
		}
	}

	// EC2 Basics
	check("ec2:DescribeRegions", func() error {
		_, err := c.EC2.DescribeRegions(ctx, &ec2.DescribeRegionsInput{DryRun: aws.Bool(true)})
		return err
	})
	check("ec2:DescribeImages", func() error {
		_, err := c.EC2.DescribeImages(ctx, &ec2.DescribeImagesInput{DryRun: aws.Bool(true)})
		return err
	})
	check("ec2:DescribeInstances", func() error {
		_, err := c.EC2.DescribeInstances(ctx, &ec2.DescribeInstancesInput{DryRun: aws.Bool(true)})
		return err
	})
	check("ec2:DescribeSpotPriceHistory", func() error {
		_, err := c.EC2.DescribeSpotPriceHistory(ctx, &ec2.DescribeSpotPriceHistoryInput{
			DryRun: aws.Bool(true), StartTime: aws.Time(time.Now()), EndTime: aws.Time(time.Now()),
		})
		return err
	})

	// VPC & Networking
	// We need a valid Resource ID to properly check CreateTags (otherwise we get InvalidID before Auth check).
	// We'll try to get a VPC ID first.
	var testResourceID string

	check("ec2:DescribeVpcs", func() error {
		_, err := c.EC2.DescribeVpcs(ctx, &ec2.DescribeVpcsInput{DryRun: aws.Bool(true)})
		if isDryRunError(err) {
			// Try to get a real ID for further tests
			realOut, realErr := c.EC2.DescribeVpcs(ctx, &ec2.DescribeVpcsInput{})
			if realErr == nil && len(realOut.Vpcs) > 0 && realOut.Vpcs[0].VpcId != nil {
				testResourceID = *realOut.Vpcs[0].VpcId
			}
		}
		return err
	})

	check("ec2:DescribeSecurityGroups", func() error {
		_, err := c.EC2.DescribeSecurityGroups(ctx, &ec2.DescribeSecurityGroupsInput{DryRun: aws.Bool(true)})
		return err
	})
	check("ec2:CreateSecurityGroup", func() error {
		_, err := c.EC2.CreateSecurityGroup(ctx, &ec2.CreateSecurityGroupInput{
			DryRun: aws.Bool(true), GroupName: aws.String("dryrun-test"), Description: aws.String("dryrun"),
		})
		return err
	})
	check("ec2:AuthorizeSecurityGroupIngress", func() error {
		_, err := c.EC2.AuthorizeSecurityGroupIngress(ctx, &ec2.AuthorizeSecurityGroupIngressInput{
			DryRun: aws.Bool(true), GroupId: aws.String("sg-0123456789abcdef0"),
		})
		return err
	})
	check("ec2:AuthorizeSecurityGroupEgress", func() error {
		_, err := c.EC2.AuthorizeSecurityGroupEgress(ctx, &ec2.AuthorizeSecurityGroupEgressInput{
			DryRun: aws.Bool(true), GroupId: aws.String("sg-0123456789abcdef0"),
		})
		return err
	})

	// Instance Lifecycle
	check("ec2:RunInstances", func() error {
		_, err = c.EC2.RunInstances(ctx, &ec2.RunInstancesInput{
			DryRun: aws.Bool(true), ImageId: aws.String("ami-0123456789abcdef0"), MaxCount: aws.Int32(1), MinCount: aws.Int32(1),
		})
		return err
	})
	check("ec2:TerminateInstances", func() error {
		_, err = c.EC2.TerminateInstances(ctx, &ec2.TerminateInstancesInput{
			DryRun: aws.Bool(true), InstanceIds: []string{"i-0123456789abcdef0"},
		})
		return err
	})

	// Check CreateTags using real resource if available.
	// If we cannot find a valid VPC to test against, we cannot reliably verify CreateTags using DryRun
	// (because dummy IDs cause validation errors before Auth checks).
	// In that case, we default to reporting it as missing/unverified to ensure the user checks it.
	tagName := "ec2:CreateTags"
	if testResourceID != "" {
		check(tagName, func() error {
			_, err := c.EC2.CreateTags(ctx, &ec2.CreateTagsInput{
				DryRun: aws.Bool(true), Resources: []string{testResourceID}, Tags: []types.Tag{{Key: aws.String("DryRun"), Value: aws.String("Verification")}},
			})
			return err
		})
	} else {
		// Fallback: We can't verify. Assume missing to be safe, as Tag-on-Create is strict.
		missingPerms = append(missingPerms, tagName)
	}

	return missingPerms, identityArg, nil
}

// isDryRunError returns true if the error implies that authorization succeeded.
// This includes:
//  1. "DryRunOperation" (Explicit success for DryRun)
//  2. Any other error that is NOT "UnauthorizedOperation" or "AuthFailure".
//     (e.g. InvalidAMIID.NotFound implies we had permission to check the AMI).
func isDryRunError(err error) bool {
	if err == nil {
		return true // No error = Success (unlikely for DryRun but safe)
	}

	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := apiErr.ErrorCode()
		// If explicitly unauthorized, return false
		if code == "UnauthorizedOperation" || code == "AuthFailure" {
			return false
		}
		// Otherwise, we likely had permission to proceed far enough to hit another error
		return true
	}

	// If it's not an API error, assume it's some client/network issue distinct from Auth denial?
	// Let's assume permission is valid to avoid confusing "Missing Permission" message for network errors.
	// However, if we preserve the error logic in VerifyPermissions, we might want to return the error?
	// VerifyPermissions returns (missing, identity, error).
	// If we return true here, we say "Permission is present".
	return true
}

// IsTestMode checks if the current environment is using test credentials
func IsTestMode() bool {
	return os.Getenv("KLOSEDLOOP_TEST_MODE") == "true"
}

// SaveCredentials writes the provided access key and secret to ~/.aws/credentials.
// This overrides the 'default' profile.
func SaveCredentials(accessKey, secretKey string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("could not find home directory: %w", err)
	}

	awsDir := filepath.Join(home, ".aws")
	if err := os.MkdirAll(awsDir, 0700); err != nil {
		return fmt.Errorf("could not create .aws directory: %w", err)
	}

	credsPath := filepath.Join(awsDir, "credentials")

	// Load existing or create new
	cfg, err := ini.Load(credsPath)
	if err != nil {
		cfg = ini.Empty()
	}

	// Set [default] profile
	sec, err := cfg.GetSection("default")
	if err != nil {
		sec, err = cfg.NewSection("default")
		if err != nil {
			return fmt.Errorf("failed to create default section: %w", err)
		}
	}

	sec.Key("aws_access_key_id").SetValue(accessKey)
	sec.Key("aws_secret_access_key").SetValue(secretKey)

	return cfg.SaveTo(credsPath)
}

// VerifyProfile checks if a specific named profile is valid.
func VerifyProfile(ctx context.Context, profileName string) (bool, error) {
	// Load config specifically for this profile
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithSharedConfigProfile(profileName),
		config.WithRegion("us-east-1"), // Default region to avoid errors
	)
	if err != nil {
		return false, fmt.Errorf("failed to load profile config: %w", err)
	}

	stsClient := sts.NewFromConfig(cfg)
	if _, err := stsClient.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{}); err != nil {
		return false, err
	}

	return true, nil
}
