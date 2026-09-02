FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY services/Shared/WebsiteProfiling.Shared/WebsiteProfiling.Shared.csproj services/Shared/WebsiteProfiling.Shared/
COPY services/CoreService/src/CoreService.Api/CoreService.Api.csproj services/CoreService/src/CoreService.Api/
RUN dotnet restore services/CoreService/src/CoreService.Api/CoreService.Api.csproj
COPY services/Shared/WebsiteProfiling.Shared/ services/Shared/WebsiteProfiling.Shared/
COPY config/typed_config_manifest.json config/typed_config_manifest.json
COPY services/CoreService/src/ services/CoreService/src/
RUN dotnet publish services/CoreService/src/CoreService.Api/CoreService.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
# curl is used by the compose healthcheck; libgssapi-krb5-2 silences Npgsql's harmless
# GSSAPI probe warning on connect. Neither ships in the aspnet image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://+:8094
EXPOSE 8094
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "CoreService.Api.dll"]
