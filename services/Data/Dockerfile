FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Data.slnx ./
COPY src/Data.Domain/Data.Domain.csproj src/Data.Domain/
COPY src/Data.Application/Data.Application.csproj src/Data.Application/
COPY src/Data.Api/Data.Api.csproj src/Data.Api/
RUN dotnet restore src/Data.Api/Data.Api.csproj
COPY src/ src/
RUN dotnet publish src/Data.Api/Data.Api.csproj -c Release -o /app/publish --no-restore

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
