FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Bff.Domain/Bff.Domain.csproj src/Bff.Domain/
COPY src/Bff.Application/Bff.Application.csproj src/Bff.Application/
COPY src/Bff.Api/Bff.Api.csproj src/Bff.Api/
RUN dotnet restore src/Bff.Api/Bff.Api.csproj
COPY src/ src/
RUN dotnet publish src/Bff.Api/Bff.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8090
EXPOSE 8090
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Bff.Api.dll"]
