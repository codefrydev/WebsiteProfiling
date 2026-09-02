namespace WebsiteProfiling.Contracts.Report;

/// <summary>String identifiers for PDF export profiles as they cross the wire (query param).
/// Mirrors Data.Domain.Models.PdfProfile's names; kept as strings here since this is the
/// boundary representation shared with the BFF, not the internal enum.</summary>
public static class PdfProfiles
{
    public const string Standard = "standard";
    public const string Executive = "executive";
    public const string Full = "full";
    public const string Premium = "premium";
}
