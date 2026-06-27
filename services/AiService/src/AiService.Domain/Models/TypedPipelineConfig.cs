namespace AiService.Domain.Models;

public sealed class IntegrationSecrets
{
    public string BingWebmasterApiKey { get; init; } = "";

    public string SerpApiKey { get; init; } = "";

    public string GoogleRichResultsApiKey { get; init; } = "";

    public string CrawlAuthPassword { get; init; } = "";

    public string CrawlCookies { get; init; } = "";
}

public sealed class McpSettings
{
    public string BearerToken { get; init; } = "";

    public string AllowedHosts { get; init; } = "";

    public string AllowedOrigins { get; init; } = "";

    public string PublicUrl { get; init; } = "";

    public string ToolBundle { get; init; } = "core";

    public string DisabledTools { get; init; } = "";

    public string EnabledDomains { get; init; } = "[\"core\",\"insight\"]";
}

public sealed class FeatureFlags
{
    public bool PipelineEnabled { get; init; } = true;

    public bool WriteEnabled { get; init; } = true;

    public bool PagesMdEnabled { get; init; } = true;

    public bool ChatEnabled { get; init; } = true;

    public bool McpVisible { get; init; } = true;

    public bool SecretsVisible { get; init; } = true;
}

public sealed class IntegrationSecretsPatch
{
    public string? BingWebmasterApiKey { get; init; }

    public string? SerpApiKey { get; init; }

    public string? GoogleRichResultsApiKey { get; init; }

    public string? CrawlAuthPassword { get; init; }

    public string? CrawlCookies { get; init; }
}

public sealed class McpSettingsPatch
{
    public string? BearerToken { get; init; }

    public string? AllowedHosts { get; init; }

    public string? AllowedOrigins { get; init; }

    public string? PublicUrl { get; init; }

    public string? ToolBundle { get; init; }

    public string? DisabledTools { get; init; }

    public string? EnabledDomains { get; init; }
}

public sealed class FeatureFlagsPatch
{
    public bool? PipelineEnabled { get; init; }

    public bool? WriteEnabled { get; init; }

    public bool? PagesMdEnabled { get; init; }

    public bool? ChatEnabled { get; init; }

    public bool? McpVisible { get; init; }

    public bool? SecretsVisible { get; init; }
}
