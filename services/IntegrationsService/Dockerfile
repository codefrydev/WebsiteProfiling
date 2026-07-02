FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Shared/WebsiteProfiling.Contracts/WebsiteProfiling.Contracts.csproj Shared/WebsiteProfiling.Contracts/
COPY Shared/WebsiteProfiling.Hosting/WebsiteProfiling.Hosting.csproj Shared/WebsiteProfiling.Hosting/
COPY Shared/WebsiteProfiling.Data/WebsiteProfiling.Data.csproj Shared/WebsiteProfiling.Data/
COPY Shared/WebsiteProfiling.Data.EntityFrameworkCore/WebsiteProfiling.Data.EntityFrameworkCore.csproj Shared/WebsiteProfiling.Data.EntityFrameworkCore/
COPY IntegrationsService/src/IntegrationsService.Domain/IntegrationsService.Domain.csproj IntegrationsService/src/IntegrationsService.Domain/
COPY IntegrationsService/src/IntegrationsService.Application/IntegrationsService.Application.csproj IntegrationsService/src/IntegrationsService.Application/
COPY IntegrationsService/src/IntegrationsService.Providers/IntegrationsService.Providers.csproj IntegrationsService/src/IntegrationsService.Providers/
COPY IntegrationsService/src/IntegrationsService.Api/IntegrationsService.Api.csproj IntegrationsService/src/IntegrationsService.Api/
RUN dotnet restore IntegrationsService/src/IntegrationsService.Api/IntegrationsService.Api.csproj
COPY Shared/WebsiteProfiling.Contracts/ Shared/WebsiteProfiling.Contracts/
COPY Shared/WebsiteProfiling.Hosting/ Shared/WebsiteProfiling.Hosting/
COPY Shared/WebsiteProfiling.Data/ Shared/WebsiteProfiling.Data/
COPY Shared/WebsiteProfiling.Data.EntityFrameworkCore/ Shared/WebsiteProfiling.Data.EntityFrameworkCore/
COPY IntegrationsService/src/ IntegrationsService/src/
RUN dotnet publish IntegrationsService/src/IntegrationsService.Api/IntegrationsService.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
# curl is used by the compose healthcheck; libgssapi-krb5-2 silences Npgsql's harmless
# GSSAPI probe warning on connect. Neither ships in the aspnet image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://+:8093
EXPOSE 8093
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "IntegrationsService.Api.dll"]
