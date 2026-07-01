FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Shared/WebsiteProfiling.Data/WebsiteProfiling.Data.csproj Shared/WebsiteProfiling.Data/
COPY Schema/src/Schema.Model/Schema.Model.csproj Schema/src/Schema.Model/
COPY Schema/src/Schema.Migrator/Schema.Migrator.csproj Schema/src/Schema.Migrator/
RUN dotnet restore Schema/src/Schema.Migrator/Schema.Migrator.csproj
COPY Shared/WebsiteProfiling.Data/ Shared/WebsiteProfiling.Data/
COPY Schema/src/ Schema/src/
RUN dotnet publish Schema/src/Schema.Migrator/Schema.Migrator.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/runtime:10.0 AS runtime
WORKDIR /app
# Npgsql probes for libgssapi_krb5 (GSSAPI auth support) even when unused; the slim runtime image
# doesn't ship it, which logs a scary-looking (but harmless) load failure on every connection attempt.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Schema.Migrator.dll"]
