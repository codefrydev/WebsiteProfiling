FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY AiService.slnx ./
COPY src/AiService.Domain/AiService.Domain.csproj src/AiService.Domain/
COPY src/AiService.Providers/AiService.Providers.csproj src/AiService.Providers/
COPY src/AiService.Tools/AiService.Tools.csproj src/AiService.Tools/
COPY src/AiService.Application/AiService.Application.csproj src/AiService.Application/
COPY src/AiService.Mcp/AiService.Mcp.csproj src/AiService.Mcp/
COPY src/AiService.Api/AiService.Api.csproj src/AiService.Api/
RUN dotnet restore src/AiService.Api/AiService.Api.csproj
COPY src/ src/
RUN dotnet publish src/AiService.Api/AiService.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://+:8092
EXPOSE 8092
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "AiService.Api.dll"]
