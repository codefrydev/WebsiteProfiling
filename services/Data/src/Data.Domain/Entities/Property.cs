namespace Data.Domain.Entities;

/// <summary>Read-only mapping of <c>properties</c> for domain → property_id lookup.</summary>
public sealed class Property
{
    public long Id { get; set; }

    public string? CanonicalDomain { get; set; }
}
