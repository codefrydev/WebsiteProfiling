FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY IntegrationsService.slnx ./
COPY src/IntegrationsService.Domain/IntegrationsService.Domain.csproj src/IntegrationsService.Domain/
COPY src/IntegrationsService.Application/IntegrationsService.Application.csproj src/IntegrationsService.Application/
COPY src/IntegrationsService.Providers/IntegrationsService.Providers.csproj src/IntegrationsService.Providers/
COPY src/IntegrationsService.Api/IntegrationsService.Api.csproj src/IntegrationsService.Api/
RUN dotnet restore src/IntegrationsService.Api/IntegrationsService.Api.csproj
COPY src/ src/
RUN dotnet publish src/IntegrationsService.Api/IntegrationsService.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://+:8093
EXPOSE 8093
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "IntegrationsService.Api.dll"]
