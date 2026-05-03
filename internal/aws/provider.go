package aws

import (
	"context"
	"klosedloop/internal/cloud"
	"sync"
)

// Provider implements cloud.Provider for AWS
type Provider struct{}

func NewProvider() *Provider {
	return &Provider{}
}

func (p *Provider) Reload(ctx context.Context) error {
	// AWS Provider creates new clients on demand, so explicit reload isn't strictly necessary for the struct itself,
	// but it's a good hook if we introduce caching later.
	// For verification, we can just check auth.
	_, err := p.VerifyAuth(ctx)
	return err
}

func (p *Provider) Name() string {
	return "AWS"
}

func (p *Provider) VerifyAuth(ctx context.Context) (bool, error) {
	// Use a dummy region to check general credentials
	c, err := NewClient(ctx, "us-east-1")
	if err != nil {
		return false, err
	}
	return c.VerifyAuth(ctx)
}

func (p *Provider) VerifyPermissions(ctx context.Context, region string) ([]string, string, error) {
	if region == "" {
		region = "us-east-1" // Fallback
	}
	c, err := NewClient(ctx, region)
	if err != nil {
		return nil, "", err
	}
	return c.VerifyPermissions(ctx)
}

func (p *Provider) GetRegions(ctx context.Context) ([]string, error) {
	c, err := NewClient(ctx, "us-east-1")
	if err != nil {
		return nil, err
	}
	return c.GetRegions(ctx)
}

func (p *Provider) GetSpotPrice(ctx context.Context, region string) (string, error) {
	c, err := NewClient(ctx, region)
	if err != nil {
		return "", err
	}
	return c.GetSpotPrice(ctx)
}

func (p *Provider) Launch(ctx context.Context, region string, clientPublicKeys []string, serverPrivateKey string, durationMinutes int, progress func(string)) (instanceID, publicIP string, err error) {
	c, err := NewClient(ctx, region)
	if err != nil {
		return "", "", err
	}
	return c.Launch(ctx, clientPublicKeys, serverPrivateKey, durationMinutes, progress)
}

func (p *Provider) GetInstanceDetails(ctx context.Context, region, instanceID string) (*cloud.InstanceDetails, error) {
	c, err := NewClient(ctx, region)
	if err != nil {
		return nil, err
	}
	return c.GetInstanceDetails(ctx, instanceID)
}

func (p *Provider) Terminate(ctx context.Context, region, instanceID string) error {
	c, err := NewClient(ctx, region)
	if err != nil {
		return err
	}
	return c.Terminate(ctx, region, instanceID)
}

func (p *Provider) ListActiveInstances(ctx context.Context) ([]cloud.InstanceDetails, error) {
	regions, err := p.GetRegions(ctx)
	if err != nil {
		return nil, err
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	var allInstances []cloud.InstanceDetails

	for _, r := range regions {
		wg.Add(1)
		go func(region string) {
			defer wg.Done()
			c, err := NewClient(ctx, region)
			if err != nil {
				return
			}
			instances, err := c.ListRunningInstances(ctx)
			if err == nil && len(instances) > 0 {
				mu.Lock()
				allInstances = append(allInstances, instances...)
				mu.Unlock()
			}
		}(r)
	}
	wg.Wait()

	return allInstances, nil
}

func (p *Provider) GetLatestMetrics(ctx context.Context, region, instanceID string) (*cloud.InstanceMetrics, error) {
	c, err := NewClient(ctx, region)
	if err != nil {
		return nil, err
	}
	return c.GetLatestMetrics(ctx, instanceID)
}
