package aws

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/aws/smithy-go"
)

// ToUserFriendlyError wraps AWS errors with human-readable messages
func ToUserFriendlyError(err error) error {
	if err == nil {
		return nil
	}

	// 1. Check for specific Smithy/AWS API errors
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		code := apiErr.ErrorCode()
		msg := apiErr.ErrorMessage()

		switch code {
		case "SpotMaxPriceExceeded":
			return fmt.Errorf("Spot price limit exceeded for this region. Please try another region. (AWS: %s)", msg)
		case "MaxSpotInstanceCountExceeded":
			return fmt.Errorf("You have reached your Spot Instance limit. Request a quota increase from AWS. (AWS: %s)", msg)
		case "VcpuLimitExceeded":
			return fmt.Errorf("AWS Account vCPU limit reached. Request a quota increase. (AWS: %s)", msg)
		case "InsufficientInstanceCapacity":
			return fmt.Errorf("AWS has no Spot capacity in this region right now. Try a different region. (AWS: %s)", msg)
		case "RequestLimitExceeded":
			return fmt.Errorf("Too many API requests. Please wait a moment and try again. (AWS: %s)", msg)
		case "AuthFailure", "InvalidClientTokenId", "SignatureDoesNotMatch":
			return fmt.Errorf("Authentication failed. Please check your Access Key and Secret Key in Settings. (AWS: %s)", msg)
		case "OptInRequired":
			return fmt.Errorf("Your AWS account is not enabled for this region/service. Check your AWS billing/status. (AWS: %s)", msg)
		}
	}

	// 2. Fallback for timeouts context errors
	if errors.Is(err, context.DeadlineExceeded) || strings.Contains(err.Error(), "timed out") {
		return fmt.Errorf("Operation timed out. The region might be busy or slow. Please try again.")
	}

	// 3. Fallback for IMDS/Missing Credentials
	if strings.Contains(err.Error(), "no EC2 IMDS role found") ||
		strings.Contains(err.Error(), "dial tcp 169.254.169.254") ||
		strings.Contains(err.Error(), "failed to get shared config profile") {
		return fmt.Errorf("No active credentials found. Please select a profile or run Quick Start.")
	}

	// 3. Generic fallback
	return fmt.Errorf("System Error: %w", err)
}
