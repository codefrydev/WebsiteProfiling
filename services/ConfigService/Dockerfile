FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY services/Shared/WebsiteProfiling.Contracts/WebsiteProfiling.Contracts.csproj services/Shared/WebsiteProfiling.Contracts/
COPY services/ConfigService/src/ConfigService.Application/ConfigService.Application.csproj services/ConfigService/src/ConfigService.Application/
COPY services/ConfigService/src/ConfigService.Api/ConfigService.Api.csproj services/ConfigService/src/ConfigService.Api/
RUN dotnet restore services/ConfigService/src/ConfigService.Api/ConfigService.Api.csproj
COPY services/Shared/WebsiteProfiling.Contracts/ services/Shared/WebsiteProfiling.Contracts/
COPY config/typed_config_manifest.json config/typed_config_manifest.json
COPY services/ConfigService/src/ services/ConfigService/src/
RUN dotnet publish services/ConfigService/src/ConfigService.Api/ConfigService.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://+:8095
ENV WEBSITE_PROFILING_ROOT=/app
EXPOSE 8095
COPY --from=build /app/publish .
COPY --from=build /src/config/typed_config_manifest.json /app/config/typed_config_manifest.json
ENTRYPOINT ["dotnet", "ConfigService.Api.dll"]
