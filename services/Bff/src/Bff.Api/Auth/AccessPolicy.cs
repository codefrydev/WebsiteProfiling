namespace Bff.Api.Auth;

public enum AccessRequirement
{
    /// <summary>No session required (health, auth endpoints).</summary>
    Anonymous,

    /// <summary>Any authenticated role, including read-only (viewer/client-readonly).</summary>
    Read,

    /// <summary>Mutating role required: admin/editor/analyst (TS requireApiAuth).</summary>
    Mutate,

    /// <summary>Chat: allows client-readonly, blocks viewer (TS requireApiAuthForChat).</summary>
    Chat,
}

/// <summary>
/// Single source of truth for the per-route access policy — the result of the per-route audit
/// the plan calls for. This replaces the 79 scattered forbiddenIfNotLocal guards + 20 requireApiAuth
/// calls in the Next.js routes. The localhost guard is intentionally dropped: under the new topology
/// it is subsumed by auth + the upstreams being network-internal.
///
/// Default convention (refine specific paths here as needed):
///   - GET/HEAD under /api  -> Read   (reads were open behind localhost before; now require a session)
///   - other methods /api   -> Mutate (mirrors the dominant requireApiAuth pattern)
///   - chat / auth / health -> explicit overrides below
/// </summary>
public static class AccessPolicy
{
    public static AccessRequirement Resolve(string method, PathString path)
    {
        // Non-/api paths (swagger/docs/health) are open.
        if (!path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase))
        {
            return AccessRequirement.Anonymous;
        }

        // Health + auth handshake endpoints.
        if (Matches(path, "/api/health")
            || Matches(path, "/api/auth/login")
            || Matches(path, "/api/auth/session")
            || Matches(path, "/api/auth/logout"))
        {
            return AccessRequirement.Anonymous;
        }

        // Chat is a read-only query but allows client-readonly.
        if (Matches(path, "/api/chat") || Matches(path, "/api/chat/"))
        {
            return AccessRequirement.Chat;
        }

        var isRead = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
        return isRead ? AccessRequirement.Read : AccessRequirement.Mutate;
    }

    private static bool Matches(PathString path, string value) =>
        path.Equals(value, StringComparison.OrdinalIgnoreCase);
}
