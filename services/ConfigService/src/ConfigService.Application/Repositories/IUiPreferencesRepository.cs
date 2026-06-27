using System.Text.Json;

namespace ConfigService.Application.Repositories;

public interface IUiPreferencesRepository
{
    Task<UiPreferencesDto> GetAsync(CancellationToken cancellationToken = default);

    Task PatchAsync(IReadOnlyDictionary<string, string> updates, CancellationToken cancellationToken = default);
}

public sealed class UiPreferencesDto
{
    public string BrandName { get; init; } = "";

    public string BrandSubtitle { get; init; } = "";

    public string BrandLogoUrl { get; init; } = "";

    public JsonElement? CustomThemeJson { get; init; }

    public JsonElement? UiPrefsJson { get; init; }
}
