package aws

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"klosedloop/internal/cloud"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	smithy "github.com/aws/smithy-go"
)

// Ensure Client implements cloud.Provider (conceptually, though we need to wrap it to handle dynamic regions)
// Actually, we will make the Client methods match the signature, but since Client is per-region, we might ignore the region arg
// OR we repurpose Client to be the Provider and hold no state?
// Let's modify the methods to be methods on *Provider which we will create in provider.go.
// For now, let's just make the logic compatible.

// GetSpotPrice fetches the current spot price. Region argument is handled by the client's config.
func (c *Client) GetSpotPrice(ctx context.Context) (string, error) {
	input := &ec2.DescribeSpotPriceHistoryInput{
		InstanceTypes:       []types.InstanceType{types.InstanceTypeT3Nano},
		ProductDescriptions: []string{"Linux/UNIX"},
		StartTime:           aws.Time(time.Now()),
	}

	output, err := c.EC2.DescribeSpotPriceHistory(ctx, input)
	if err != nil {
		return "", err
	}

	if len(output.SpotPriceHistory) == 0 {
		return "N/A", nil
	}

	// Sort by Timestamp descending (just in case)
	sort.Slice(output.SpotPriceHistory, func(i, j int) bool {
		return output.SpotPriceHistory[i].Timestamp.After(*output.SpotPriceHistory[j].Timestamp)
	})

	priceStr := *output.SpotPriceHistory[0].SpotPrice
	price, err := strconv.ParseFloat(priceStr, 64)
	if err != nil {
		return priceStr, nil
	}

	// Format nicely
	return fmt.Sprintf("$%.4f/hr", price), nil
}

// GetRegions fetches all enabled regions for the account
func (c *Client) GetRegions(ctx context.Context) ([]string, error) {
	output, err := c.EC2.DescribeRegions(ctx, &ec2.DescribeRegionsInput{
		AllRegions: aws.Bool(false), // Only enabled regions (Mitigation for R-05: IP Reputation/Availability)
	})
	if err != nil {
		return nil, err
	}

	var regions []string
	for _, r := range output.Regions {
		if r.RegionName != nil {
			regions = append(regions, *r.RegionName)
		}
	}
	// Sort for better UX
	sort.Strings(regions)
	return regions, nil
}

type subnetInfo struct {
	ID string
	AZ string
}

func isCapacityError(err error) bool {
	if err == nil {
		return false
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode() == "InsufficientInstanceCapacity"
	}
	return strings.Contains(err.Error(), "InsufficientInstanceCapacity")
}

func (c *Client) runInstance(ctx context.Context, amiID, sgID, userData, subnetID string) (string, error) {
	ni := types.InstanceNetworkInterfaceSpecification{
		DeviceIndex:              aws.Int32(0),
		AssociatePublicIpAddress: aws.Bool(true),
		Groups:                   []string{sgID},
	}
	if subnetID != "" {
		ni.SubnetId = aws.String(subnetID)
	}
	result, err := c.EC2.RunInstances(ctx, &ec2.RunInstancesInput{
		ImageId:      aws.String(amiID),
		InstanceType: types.InstanceTypeT3Micro,
		MinCount:     aws.Int32(1),
		MaxCount:     aws.Int32(1),
		UserData:     aws.String(userData),
		MetadataOptions: &types.InstanceMetadataOptionsRequest{
			HttpTokens: types.HttpTokensStateRequired,
		},
		InstanceInitiatedShutdownBehavior: types.ShutdownBehaviorTerminate,
		InstanceMarketOptions: &types.InstanceMarketOptionsRequest{
			MarketType: types.MarketTypeSpot,
		},
		TagSpecifications: []types.TagSpecification{
			{
				ResourceType: types.ResourceTypeInstance,
				Tags: []types.Tag{
					{Key: aws.String("Project"), Value: aws.String("klosedloop")},
				},
			},
		},
		NetworkInterfaces: []types.InstanceNetworkInterfaceSpecification{ni},
	})
	if err != nil {
		return "", err
	}
	return *result.Instances[0].InstanceId, nil
}

func (c *Client) getDefaultSubnets(ctx context.Context, vpcID string) ([]subnetInfo, error) {
	out, err := c.EC2.DescribeSubnets(ctx, &ec2.DescribeSubnetsInput{
		Filters: []types.Filter{
			{Name: aws.String("vpc-id"), Values: []string{vpcID}},
			{Name: aws.String("default-for-az"), Values: []string{"true"}},
		},
	})
	if err != nil {
		return nil, err
	}
	var subnets []subnetInfo
	for _, s := range out.Subnets {
		if s.SubnetId != nil && s.AvailabilityZone != nil {
			subnets = append(subnets, subnetInfo{ID: *s.SubnetId, AZ: *s.AvailabilityZone})
		}
	}
	return subnets, nil
}

func (c *Client) getConsoleSnippet(instanceID string) string {
	out, err := c.EC2.GetConsoleOutput(context.Background(), &ec2.GetConsoleOutputInput{
		InstanceId: aws.String(instanceID),
	})
	if err != nil || out.Output == nil {
		return ""
	}
	decoded, err := base64.StdEncoding.DecodeString(*out.Output)
	if err != nil {
		return ""
	}
	text := string(decoded)
	if len(text) > 2000 {
		text = "...\n" + text[len(text)-2000:]
	}
	return text
}

// Launch starts a t3.nano Spot Instance.
func (c *Client) Launch(ctx context.Context, clientPublicKeys []string, serverPrivateKey string, durationMinutes int, progress func(string)) (instanceID, publicIP string, err error) {
	if progress != nil {
		progress("Resolving VPC and Security Groups...")
	}

	vpcID, err := c.getDefaultVPC(ctx)
	if err != nil {
		return "", "", fmt.Errorf("failed to locate default VPC: %w", err)
	}

	sgID, err := c.ensureSecurityGroup(ctx, vpcID)
	if err != nil {
		return "", "", fmt.Errorf("failed to ensure security group: %w", err)
	}

	// 1. Find AMI
	if progress != nil {
		progress("Finding latest Amazon Linux AMI...")
	}
	amiID, err := c.getLatestAmazonLinuxami(ctx)
	if err != nil {
		return "", "", fmt.Errorf("failed to find AMI: %w", err)
	}

	// 2. Prepare UserData
	shutdownCmd := ""
	if durationMinutes > 0 {
		shutdownCmd = fmt.Sprintf("shutdown -h +%d", durationMinutes)
	}

	// Construct Peer Blocks
	var peerBlocks strings.Builder
	for i, key := range clientPublicKeys {
		// Peer IPs: .2, .3, .4 ...
		peerIP := fmt.Sprintf("10.100.0.%d/32", i+2)
		peerBlocks.WriteString(fmt.Sprintf(`
[Peer]
# Device %d
PublicKey = %s
AllowedIPs = %s
`, i+1, key, peerIP))
	}

	userDataScript := fmt.Sprintf(`#!/bin/bash
set -euo pipefail
dnf update -y
dnf install -y wireguard-tools iptables-services

# Enable IP Forwarding & Performance Tuning (BBR + Buffers)
cat <<EOF > /etc/sysctl.d/99-sysctl.conf
net.ipv4.ip_forward=1
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.core.rmem_max=4194304
net.core.wmem_max=4194304
EOF
sysctl -p /etc/sysctl.d/99-sysctl.conf

# Detect Main Interface
IFACE=$(ip route show default | awk '{print $5}' | head -n1)

# Configure WireGuard
cat <<EOF > /etc/wireguard/wg0.conf
[Interface]
PrivateKey = %s
Address = 10.100.0.1/32
ListenPort = 51820
MTU = 1360

# PostUp:
# 1. Allow traffic from wg0 to physical interface (Forwarding)
# 2. Allow traffic from physical interface to wg0 (Return traffic)
# 3. Masquerade (NAT) traffic leaving the physical interface
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o ${IFACE} -j MASQUERADE

# PostDown:
# Clean up rules
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o ${IFACE} -j MASQUERADE

%s
EOF

# Start Interface
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Schedule Auto-Shutdown
%s
`, serverPrivateKey, peerBlocks.String(), shutdownCmd)

	encodedUserData := base64.StdEncoding.EncodeToString([]byte(userDataScript))

	// 3. Launch Request — with AZ fallback on InsufficientCapacity
	if progress != nil {
		progress("Requesting Spot Instance...")
	}
	instanceID, err = c.runInstance(ctx, amiID, sgID, encodedUserData, "")
	if err != nil && isCapacityError(err) {
		subnets, subErr := c.getDefaultSubnets(ctx, vpcID)
		if subErr == nil {
			for _, subnet := range subnets {
				if progress != nil {
					progress(fmt.Sprintf("Retrying in zone %s...", subnet.AZ))
				}
				instanceID, err = c.runInstance(ctx, amiID, sgID, encodedUserData, subnet.ID)
				if err == nil {
					break
				}
				if !isCapacityError(err) {
					break
				}
			}
		}
	}
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "MaxSpotInstanceCountExceeded") {
			return "", "", fmt.Errorf("quota exceeded: spot instance limit reached for this region")
		}
		if isCapacityError(err) {
			return "", "", fmt.Errorf("region busy: no spot capacity available in any zone (try another region)")
		}
		return "", "", fmt.Errorf("run instances failed: %w", err)
	}

	// 4. Wait for Public IP (Extended Polling)
	if progress != nil {
		progress("Waiting for Instance Boot & Public IP (up to 120s)...")
	}

	// Default 40s -> 120s (60 * 2s)
	for i := 0; i < 60; i++ {
		desc, err := c.EC2.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
			InstanceIds: []string{instanceID},
		})
		if err == nil && len(desc.Reservations) > 0 && len(desc.Reservations[0].Instances) > 0 {
			inst := desc.Reservations[0].Instances[0]
			// Check state
			state := inst.State.Name
			if progress != nil && i%5 == 0 { // Update every 10s
				progress(fmt.Sprintf("Status: %s (Waiting for IP...)", state))
			}

			if inst.PublicIpAddress != nil {
				publicIP = *inst.PublicIpAddress
				return instanceID, publicIP, nil
			}
		}

		select {
		case <-ctx.Done():
			return "", "", ctx.Err()
		case <-time.After(2 * time.Second):
			continue
		}
	}

	if snippet := c.getConsoleSnippet(instanceID); snippet != "" {
		return instanceID, "", fmt.Errorf("VPN server timed out after 120s.\nInstance %s console:\n%s", instanceID, snippet)
	}
	return instanceID, "", fmt.Errorf("VPN server timed out after 120s (instance %s still booting)", instanceID)
}

// GetInstanceDetails fetches metadata for a specific instance
func (c *Client) GetInstanceDetails(ctx context.Context, instanceID string) (*cloud.InstanceDetails, error) {
	desc, err := c.EC2.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
		InstanceIds: []string{instanceID},
	})
	if err != nil {
		return nil, err
	}

	if len(desc.Reservations) == 0 || len(desc.Reservations[0].Instances) == 0 {
		return nil, fmt.Errorf("instance not found")
	}

	inst := desc.Reservations[0].Instances[0]

	var az string
	if inst.Placement != nil && inst.Placement.AvailabilityZone != nil {
		az = *inst.Placement.AvailabilityZone
	}

	coreCount := 1
	if inst.CpuOptions != nil && inst.CpuOptions.CoreCount != nil {
		coreCount = int(*inst.CpuOptions.CoreCount) * int(*inst.CpuOptions.ThreadsPerCore)
	}

	details := &cloud.InstanceDetails{
		InstanceID:       *inst.InstanceId,
		InstanceType:     string(inst.InstanceType),
		State:            string(inst.State.Name),
		LaunchTime:       inst.LaunchTime.Format(time.RFC3339),
		ImageID:          *inst.ImageId,
		AvailabilityZone: az,
		CoreCount:        coreCount,
		MemorySizeGB:     estimateMemoryGB(string(inst.InstanceType)),
	}

	if inst.PublicIpAddress != nil {
		details.PublicIP = *inst.PublicIpAddress
	}

	return details, nil
}

func estimateMemoryGB(instanceType string) string {
	switch instanceType {
	case "t3.nano":
		return "0.5 GB"
	case "t3.micro":
		return "1.0 GB"
	case "t3.small":
		return "2.0 GB"
	case "t3.medium":
		return "4.0 GB"
	case "t2.micro":
		return "1.0 GB"
	default:
		return "Unknown"
	}
}

func (c *Client) Terminate(ctx context.Context, region, instanceID string) error {
	_, err := c.EC2.TerminateInstances(ctx, &ec2.TerminateInstancesInput{
		InstanceIds: []string{instanceID},
	})
	return err
}

func (c *Client) getLatestAmazonLinuxami(ctx context.Context) (string, error) {
	// Look for AL2023 AMI
	input := &ec2.DescribeImagesInput{
		Owners: []string{"amazon"},
		Filters: []types.Filter{
			{
				Name:   aws.String("name"),
				Values: []string{"al2023-ami-2023.*-x86_64"},
			},
			{
				Name:   aws.String("state"),
				Values: []string{"available"},
			},
		},
	}

	output, err := c.EC2.DescribeImages(ctx, input)
	if err != nil {
		return "", err
	}

	if len(output.Images) == 0 {
		return "", fmt.Errorf("no AMIs found")
	}

	// Sort by CreationDate descending
	sort.Slice(output.Images, func(i, j int) bool {
		return *output.Images[i].CreationDate > *output.Images[j].CreationDate
	})

	return *output.Images[0].ImageId, nil
}

func (c *Client) getDefaultVPC(ctx context.Context) (string, error) {
	out, err := c.EC2.DescribeVpcs(ctx, &ec2.DescribeVpcsInput{
		Filters: []types.Filter{
			{
				Name:   aws.String("is-default"),
				Values: []string{"true"},
			},
		},
	})
	if err != nil {
		return "", err
	}
	if len(out.Vpcs) == 0 || out.Vpcs[0].VpcId == nil {
		return "", fmt.Errorf("no default VPC found")
	}
	return *out.Vpcs[0].VpcId, nil
}

func (c *Client) ensureSecurityGroup(ctx context.Context, vpcID string) (string, error) {
	const sgName = "klosedloop-wg"

	// Reuse if present
	existing, err := c.EC2.DescribeSecurityGroups(ctx, &ec2.DescribeSecurityGroupsInput{
		Filters: []types.Filter{
			{Name: aws.String("group-name"), Values: []string{sgName}},
			{Name: aws.String("vpc-id"), Values: []string{vpcID}},
		},
	})
	if err == nil && len(existing.SecurityGroups) > 0 {
		if existing.SecurityGroups[0].GroupId != nil {
			return *existing.SecurityGroups[0].GroupId, nil
		}
	}

	createOut, err := c.EC2.CreateSecurityGroup(ctx, &ec2.CreateSecurityGroupInput{
		Description: aws.String("Klosedloop WireGuard access"),
		GroupName:   aws.String(sgName),
		VpcId:       aws.String(vpcID),
		TagSpecifications: []types.TagSpecification{
			{
				ResourceType: types.ResourceTypeSecurityGroup,
				Tags: []types.Tag{
					{Key: aws.String("Project"), Value: aws.String("klosedloop")},
				},
			},
		},
	})
	if err != nil {
		return "", err
	}
	sgID := *createOut.GroupId

	_, err = c.EC2.AuthorizeSecurityGroupIngress(ctx, &ec2.AuthorizeSecurityGroupIngressInput{
		GroupId: aws.String(sgID),
		IpPermissions: []types.IpPermission{
			{
				IpProtocol: aws.String("udp"),
				FromPort:   aws.Int32(51820),
				ToPort:     aws.Int32(51820),
				IpRanges: []types.IpRange{
					{
						CidrIp:      aws.String("0.0.0.0/0"),
						Description: aws.String("WireGuard UDP 51820"),
					},
				},
			},
		},
	})
	if err != nil && !isDuplicateRule(err) {
		return "", err
	}

	_, err = c.EC2.AuthorizeSecurityGroupEgress(ctx, &ec2.AuthorizeSecurityGroupEgressInput{
		GroupId: aws.String(sgID),
		IpPermissions: []types.IpPermission{
			{
				IpProtocol: aws.String("-1"),
				IpRanges: []types.IpRange{
					{
						CidrIp:      aws.String("0.0.0.0/0"),
						Description: aws.String("Allow all egress"),
					},
				},
			},
		},
	})
	if err != nil && !isDuplicateRule(err) {
		return "", err
	}

	return sgID, nil
}

func isDuplicateRule(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "InvalidPermission.Duplicate")
}

// ListRunningInstances returns instances managed by KlosedLoop that are currently running
func (c *Client) ListRunningInstances(ctx context.Context) ([]cloud.InstanceDetails, error) {
	input := &ec2.DescribeInstancesInput{
		Filters: []types.Filter{
			{
				Name:   aws.String("instance-state-name"),
				Values: []string{"running", "pending"},
			},
			{
				Name:   aws.String("tag:Project"),
				Values: []string{"klosedloop"},
			},
		},
	}

	result, err := c.EC2.DescribeInstances(ctx, input)
	if err != nil {
		return nil, err
	}

	var instances []cloud.InstanceDetails
	for _, r := range result.Reservations {
		for _, inst := range r.Instances {
			// Convert to InstanceDetails
			az := ""
			if inst.Placement != nil && inst.Placement.AvailabilityZone != nil {
				az = *inst.Placement.AvailabilityZone
			}

			// Safe dereference helpers
			id := ""
			if inst.InstanceId != nil {
				id = *inst.InstanceId
			}
			ip := ""
			if inst.PublicIpAddress != nil {
				ip = *inst.PublicIpAddress
			}
			img := ""
			if inst.ImageId != nil {
				img = *inst.ImageId
			}

			lTime := ""
			if inst.LaunchTime != nil {
				lTime = inst.LaunchTime.Format(time.RFC3339)
			}

			instances = append(instances, cloud.InstanceDetails{
				InstanceID:       id,
				InstanceType:     string(inst.InstanceType),
				PublicIP:         ip,
				State:            string(inst.State.Name),
				LaunchTime:       lTime,
				AvailabilityZone: az,
				ImageID:          img,
			})
		}
	}
	return instances, nil
}
