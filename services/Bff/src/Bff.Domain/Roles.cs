namespace Bff.Domain;

/// <summary>
/// Role model, kept byte-compatible with the TypeScript auth layer
/// (web/src/server/auth.ts). The BFF is the single browser-facing API surface and
/// terminates auth, so these tiers must mirror the Next.js semantics exactly.
/// </summary>
public static class Roles
{
    public const string Admin = "admin";
    public const string Editor = "editor";
    public const string Analyst = "analyst";
    public const string Viewer = "viewer";
    public const string ClientReadonly = "client-readonly";

    /// <summary>Read-only roles (TS: READONLY_ROLES). Cannot mutate.</summary>
    private static readonly HashSet<string> ReadonlyRoles = new(StringComparer.Ordinal)
    {
        Viewer,
        ClientReadonly,
    };

    /// <summary>TS canMutateRole: admin/editor/analyst may mutate; viewer/client-readonly may not.</summary>
    public static bool CanMutate(string? role)
    {
        if (string.IsNullOrEmpty(role))
        {
            return false;
        }
        return !ReadonlyRoles.Contains(role);
    }

    /// <summary>TS requireApiAuthForChat: chat allows client-readonly but blocks viewer.</summary>
    public static bool CanChat(string? role)
    {
        if (string.IsNullOrEmpty(role))
        {
            return false;
        }
        return role != Viewer;
    }

    public static bool IsReadonly(string? role) =>
        !string.IsNullOrEmpty(role) && ReadonlyRoles.Contains(role);
}
