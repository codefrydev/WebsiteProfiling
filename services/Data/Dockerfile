FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Shared/WebsiteProfiling.Contracts/WebsiteProfiling.Contracts.csproj Shared/WebsiteProfiling.Contracts/
COPY Data/src/Data.Domain/Data.Domain.csproj Data/src/Data.Domain/
COPY Data/src/Data.Application/Data.Application.csproj Data/src/Data.Application/
COPY Data/src/Data.Api/Data.Api.csproj Data/src/Data.Api/
RUN dotnet restore Data/src/Data.Api/Data.Api.csproj
COPY Shared/WebsiteProfiling.Contracts/ Shared/WebsiteProfiling.Contracts/
COPY Data/src/ Data/src/
RUN dotnet publish Data/src/Data.Api/Data.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
# curl is used by the compose healthcheck; the aspnet image does not ship it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://+:8091
EXPOSE 8091
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Data.Api.dll"]
