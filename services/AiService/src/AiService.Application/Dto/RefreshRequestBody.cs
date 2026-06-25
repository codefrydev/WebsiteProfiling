namespace AiService.Application.Dto;

/// <summary>Shared refresh flag for enrichment/issue endpoints.</summary>
public sealed class RefreshRequestBody
{
    public bool Refresh { get; set; }
}
