using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class LighthouseSetting
{
    public long Id { get; set; }

    public string LighthouseUrl { get; set; } = null!;

    public string LighthouseMode { get; set; } = null!;

    public string LighthouseStrategy { get; set; } = null!;

    public string LighthouseCategories { get; set; } = null!;

    public string LighthouseIterations { get; set; } = null!;

    public string RunLighthouse { get; set; } = null!;

    public string RunLighthouseOnPages { get; set; } = null!;

    public string EnableCrux { get; set; } = null!;

    public string EnableRichResultsValidation { get; set; } = null!;

    public string EnableAxe { get; set; } = null!;

    public string EnableSpellCheck { get; set; } = null!;

    public string EnableHtmlValidation { get; set; } = null!;

    public string EnableAmpAudit { get; set; } = null!;

    public string EnableWaybackLookup { get; set; } = null!;

    public string LighthouseMaxPages { get; set; } = null!;

    public string LighthouseConcurrency { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
