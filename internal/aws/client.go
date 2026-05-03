package aws

import (
	"context"
	"fmt"
	"klosedloop/internal/cloud"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/cloudwatch"
	"github.com/aws/aws-sdk-go-v2/service/cloudwatch/types"
	"github.com/aws/aws-sdk-go-v2/service/ec2"

	appConfig "klosedloop/internal/config"
)

// Client holds the EC2 service client.
type Client struct {
	EC2 *ec2.Client
	CW  *cloudwatch.Client
	Cfg aws.Config
}

// Name returns the provider name
func (c *Client) Name() string {
	return "AWS"
}

// NewClient initializes a new AWS client for a specific region.
// It loads credentials from the active profile in preferences.
func NewClient(ctx context.Context, region string) (*Client, error) {
	// Determine active profile
	profileName := "default"
	if prefs, err := appConfig.LoadPreferences(); err == nil && prefs.ActiveProfile != "" {
		profileName = prefs.ActiveProfile
	}

	// Check available profiles
	var profiles []string
	if list, err := appConfig.ListProfiles(); err == nil {
		profiles = list
	}

	profileExists := false
	for _, p := range profiles {
		if p == profileName {
			profileExists = true
			break
		}
	}

	// Logic:
	// 1. If requested profile exists, use it.
	// 2. If requested is "default" and MISSING, but we have exactly 1 other profile, auto-use that one.
	//    (Reduces friction for users who add a profile but forget to click "Activate")
	if !profileExists && profileName == "default" && len(profiles) == 1 {
		profileName = profiles[0]
		profileExists = true
	}

	// Prepare config options
	opts := []func(*config.LoadOptions) error{
		config.WithRegion(region),
	}

	if profileExists || profileName != "default" {
		opts = append(opts, config.WithSharedConfigProfile(profileName))
	}

	cfg, err := config.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("unable to load SDK config, %v", err)
	}
	return &Client{
		EC2: ec2.NewFromConfig(cfg),
		CW:  cloudwatch.NewFromConfig(cfg),
		Cfg: cfg,
	}, nil
}

func (c *Client) GetLatestMetrics(ctx context.Context, instanceID string) (*cloud.InstanceMetrics, error) {
	if c.CW == nil {
		return nil, fmt.Errorf("CloudWatch client not initialized")
	}

	endTime := time.Now()
	startTime := endTime.Add(-5 * time.Minute) // Look back 5 mins to ensure data points

	// Helper to fetch single metric
	fetch := func(name string) (float64, error) {
		out, err := c.CW.GetMetricData(ctx, &cloudwatch.GetMetricDataInput{
			StartTime: &startTime,
			EndTime:   &endTime,
			MetricDataQueries: []types.MetricDataQuery{
				{
					Id: aws.String("m1"),
					MetricStat: &types.MetricStat{
						Metric: &types.Metric{
							Namespace:  aws.String("AWS/EC2"),
							MetricName: aws.String(name),
							Dimensions: []types.Dimension{
								{Name: aws.String("InstanceId"), Value: aws.String(instanceID)},
							},
						},
						Period: aws.Int32(60),
						Stat:   aws.String("Average"),
					},
				},
			},
		})
		if err != nil {
			return 0, err
		}
		if len(out.MetricDataResults) > 0 && len(out.MetricDataResults[0].Values) > 0 {
			return out.MetricDataResults[0].Values[0], nil
		}
		return 0, nil
	}

	cpu, _ := fetch("CPUUtilization")
	netIn, _ := fetch("NetworkIn")
	netOut, _ := fetch("NetworkOut")

	return &cloud.InstanceMetrics{
		CPU:        cpu,
		NetworkIn:  netIn,
		NetworkOut: netOut,
		Timestamp:  time.Now().Format(time.RFC3339),
	}, nil
}
