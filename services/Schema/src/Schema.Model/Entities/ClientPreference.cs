using System;
using System.Collections.Generic;

namespace Schema.Model.Entities;

public partial class ClientPreference
{
    public long Id { get; set; }

    public string DefaultLandingView { get; set; } = null!;

    public string ChatFabCorner { get; set; } = null!;

    public bool SidebarCollapsed { get; set; }

    public string NetworkViewMode { get; set; } = null!;

    public bool ContentStudioAiEnabled { get; set; }

    public string PipelinePythonExe { get; set; } = null!;

    public string PipelineRepoRoot { get; set; } = null!;

    public string RadiusScale { get; set; } = null!;

    public string DensityScale { get; set; } = null!;

    public bool AnimationsEnabled { get; set; }

    public string FontSizeScale { get; set; } = null!;

    public DateTimeOffset UpdatedAt { get; set; }
}
