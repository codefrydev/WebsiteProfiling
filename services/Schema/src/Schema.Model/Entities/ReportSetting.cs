using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class ReportSetting
{
    public long Id { get; set; }

    public string OutboundDomainMaxRows { get; set; } = null!;

    public string IncludeKeywordOpportunities { get; set; } = null!;

    public string SiteName { get; set; } = null!;

    public string ReportTitle { get; set; } = null!;

    public string MaxFetchForEdges { get; set; } = null!;

    public string SameDomainOnly { get; set; } = null!;

    public string MaxNodesPlot { get; set; } = null!;

    public string RunSecurityScan { get; set; } = null!;

    public string SecurityScanActive { get; set; } = null!;

    public string SecurityMaxUrlsProbe { get; set; } = null!;

    public string ProbeImageInventory { get; set; } = null!;

    public string MaxImageProbeUrls { get; set; } = null!;

    public string ImageProbeConcurrency { get; set; } = null!;

    public string ImageProbeTimeout { get; set; } = null!;

    public string ImageUnoptimizedMinKb { get; set; } = null!;

    public string EnableSubdomainDiscovery { get; set; } = null!;

    public string SubdomainCtLookup { get; set; } = null!;

    public string EnableRdapOrgLookup { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
