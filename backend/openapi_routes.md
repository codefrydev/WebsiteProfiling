# API route inventory (146 paths)

## `/api/v1/advertising/ai/copy`
- **POST** Generate Ad Copy

## `/api/v1/advertising/competitor-ads`
- **GET** Get Competitor Ads

## `/api/v1/advertising/competitors/{domain}`
- **GET** Competitor Ads By Domain

## `/api/v1/advertising/intelligence`
- **GET** List Ad Intelligence

## `/api/v1/advertising/intelligence/fetch`
- **GET** Fetch Ad Intelligence

## `/api/v1/advertising/keyword-cpc`
- **GET** Get Keyword Cpc

## `/api/v1/advertising/keywords`
- **GET** List Ppc Keywords
- **POST** Add Ppc Keyword

## `/api/v1/advertising/keywords/{keyword_id}`
- **DELETE** Delete Ppc Keyword

## `/api/v1/advertising/ppc-research`
- **GET** Ppc Keyword Research

## `/api/v1/alerts/`
- **GET** List Alerts
- **POST** Create Alert

## `/api/v1/alerts/history`
- **GET** List Alerts History

## `/api/v1/alerts/{alert_id}`
- **DELETE** Delete Alert
- **GET** Get Alert
- **PUT** Update Alert

## `/api/v1/alerts/{alert_id}/history`
- **GET** Get Alert History

## `/api/v1/alerts/{alert_id}/test`
- **POST** Test Alert Delivery

## `/api/v1/analytics/ai-traffic`
- **GET** Get Ai Traffic

## `/api/v1/analytics/bots`
- **GET** Get Bots

## `/api/v1/analytics/devices`
- **GET** Get Devices

## `/api/v1/analytics/events`
- **POST** Ingest Event

## `/api/v1/analytics/funnels`
- **GET** List Funnels
- **POST** Create Funnel

## `/api/v1/analytics/funnels/{funnel_id}`
- **GET** Get Funnel

## `/api/v1/analytics/geo`
- **GET** Get Geo

## `/api/v1/analytics/goals`
- **GET** List Goals
- **POST** Create Goal

## `/api/v1/analytics/overview`
- **GET** Get Overview

## `/api/v1/analytics/pages`
- **GET** Get Top Pages

## `/api/v1/analytics/realtime`
- **GET** Get Realtime

## `/api/v1/analytics/sources`
- **GET** Get Traffic Sources

## `/api/v1/brand-radar/ai-citations`
- **GET** Get Ai Citations

## `/api/v1/brand-radar/ai-citations/prompts`
- **GET** Get Tracked Prompts
- **POST** Add Tracked Prompt

## `/api/v1/brand-radar/ai-citations/scan`
- **POST** Scan Ai Citations

## `/api/v1/brand-radar/competitors`
- **GET** Get Competitor Visibility

## `/api/v1/brand-radar/mentions`
- **GET** Get Mentions

## `/api/v1/brand-radar/mentions/scan`
- **POST** Scan Mentions

## `/api/v1/brand-radar/share-of-voice`
- **GET** Get Share Of Voice

## `/api/v1/brand-radar/youtube`
- **GET** Get Youtube Mentions

## `/api/v1/competitive/backlink-gap`
- **GET** Backlink Gap

## `/api/v1/competitive/batch-analysis`
- **POST** Create Batch Analysis

## `/api/v1/competitive/batch-analysis/{job_id}`
- **GET** Get Batch Analysis

## `/api/v1/competitive/compare`
- **POST** Compare Domains

## `/api/v1/competitive/keyword-gap`
- **GET** Keyword Gap

## `/api/v1/competitive/market-segments`
- **GET** List Segments
- **POST** Create Segment

## `/api/v1/competitive/market-segments/{segment_id}`
- **GET** Get Segment

## `/api/v1/competitive/traffic/{domain}`
- **GET** Get Domain Traffic

## `/api/v1/content/ai/brief`
- **POST** Generate Brief

## `/api/v1/content/ai/chat`
- **POST** Content Ai Chat

## `/api/v1/content/ai/draft`
- **POST** Generate Draft

## `/api/v1/content/ai/meta`
- **POST** Generate Meta

## `/api/v1/content/ai/optimize`
- **POST** Optimize Content

## `/api/v1/content/clusters`
- **POST** Cluster Content

## `/api/v1/content/explorer`
- **GET** Search Content

## `/api/v1/content/inventory`
- **GET** Get Inventory

## `/api/v1/content/inventory/decay`
- **GET** Detect Decay

## `/api/v1/content/inventory/sync`
- **POST** Sync Inventory

## `/api/v1/content/score`
- **POST** Grade Content

## `/api/v1/content/topic-research`
- **GET** Topic Research

## `/api/v1/gsc/cannibalization/{property_id}`
- **GET** Get Cannibalization

## `/api/v1/gsc/countries/{property_id}`
- **GET** Get Countries

## `/api/v1/gsc/decay/{property_id}`
- **GET** Get Content Decay

## `/api/v1/gsc/devices/{property_id}`
- **GET** Get Devices

## `/api/v1/gsc/export/{property_id}`
- **GET** Export Gsc Data

## `/api/v1/gsc/low-hanging-fruit/{property_id}`
- **GET** Get Low Hanging Fruit

## `/api/v1/gsc/overview/{property_id}`
- **GET** Get Overview

## `/api/v1/gsc/pages/{property_id}`
- **GET** Get Pages

## `/api/v1/gsc/properties`
- **GET** List Properties
- **POST** Add Property

## `/api/v1/gsc/properties/{property_id}`
- **DELETE** Remove Property

## `/api/v1/gsc/queries/{property_id}`
- **GET** Get Queries

## `/api/v1/gsc/sync/{property_id}`
- **POST** Sync Property

## `/api/v1/jobs/`
- **GET** List Jobs

## `/api/v1/jobs/{job_id}`
- **DELETE** Cancel Job
- **GET** Get Job

## `/api/v1/jobs/{job_id}/retry`
- **POST** Retry Job

## `/api/v1/keywords/cluster`
- **POST** Cluster Keywords

## `/api/v1/keywords/export`
- **GET** Export Keywords

## `/api/v1/keywords/import`
- **POST** Import Keywords

## `/api/v1/keywords/questions`
- **GET** Get Question Keywords

## `/api/v1/keywords/related`
- **GET** Get Related Keywords

## `/api/v1/keywords/research`
- **POST** Research Keywords

## `/api/v1/keywords/search`
- **GET** Search Keywords

## `/api/v1/keywords/serp`
- **GET** Get Serp

## `/api/v1/keywords/suggestions/ai`
- **POST** Ai Keyword Suggestions

## `/api/v1/local-seo/citations`
- **GET** List Citations
- **POST** Add Citation

## `/api/v1/local-seo/citations/scan`
- **POST** Scan Citations

## `/api/v1/local-seo/heatmap/{profile_id}`
- **GET** Local Heatmap

## `/api/v1/local-seo/profiles`
- **GET** List Gbp Profiles
- **POST** Create Gbp Profile

## `/api/v1/local-seo/profiles/{profile_id}`
- **DELETE** Delete Gbp Profile
- **GET** Get Gbp Profile
- **PUT** Update Gbp Profile

## `/api/v1/local-seo/profiles/{profile_id}/sync`
- **POST** Sync Gbp Profile

## `/api/v1/local-seo/rank-history`
- **GET** Get Local Rank History

## `/api/v1/local-seo/reviews`
- **GET** List Reviews

## `/api/v1/local-seo/reviews/ai-suggest`
- **POST** Ai Suggest From Text

## `/api/v1/local-seo/reviews/{review_id}/ai-response`
- **POST** Ai Suggest Response

## `/api/v1/local-seo/reviews/{review_id}/respond`
- **POST** Respond To Review

## `/api/v1/projects`
- **GET** List Projects
- **POST** Create Project

## `/api/v1/projects/{project_id}`
- **DELETE** Delete Project
- **GET** Get Project
- **PUT** Update Project

## `/api/v1/rank-tracker/cannibalization`
- **GET** Get Cannibalization

## `/api/v1/rank-tracker/check`
- **POST** Trigger Rank Check

## `/api/v1/rank-tracker/history`
- **GET** Get Rank History

## `/api/v1/rank-tracker/history/{keyword_id}`
- **GET** Get Keyword History

## `/api/v1/rank-tracker/keywords`
- **GET** List Tracked Keywords
- **POST** Add Keywords

## `/api/v1/rank-tracker/keywords/{keyword_id}`
- **DELETE** Remove Keyword

## `/api/v1/rank-tracker/serp/{keyword_id}`
- **GET** Get Serp Snapshot

## `/api/v1/rank-tracker/visibility`
- **GET** Get Visibility

## `/api/v1/reporting/generate`
- **POST** Generate Report Alias

## `/api/v1/reporting/portfolios`
- **GET** List Portfolios
- **POST** Create Portfolio

## `/api/v1/reporting/portfolios/{portfolio_id}`
- **DELETE** Delete Portfolio
- **GET** Get Portfolio
- **PUT** Update Portfolio

## `/api/v1/reporting/portfolios/{portfolio_id}/metrics`
- **GET** Portfolio Metrics

## `/api/v1/reporting/reports`
- **GET** List Reports

## `/api/v1/reporting/reports/generate`
- **POST** Generate Report

## `/api/v1/reporting/scheduled`
- **GET** List Scheduled Reports
- **POST** Create Scheduled Report

## `/api/v1/reporting/scheduled/{scheduled_id}`
- **DELETE** Delete Scheduled Report

## `/api/v1/reporting/templates`
- **GET** List Templates
- **POST** Create Template

## `/api/v1/reporting/templates/{template_id}`
- **DELETE** Delete Template
- **GET** Get Template
- **PUT** Update Template

## `/api/v1/settings/`
- **GET** List Settings

## `/api/v1/settings/audit-log`
- **GET** List Audit Log

## `/api/v1/settings/bulk`
- **POST** Bulk Set Settings

## `/api/v1/settings/export`
- **GET** Export Settings

## `/api/v1/settings/{key}`
- **DELETE** Delete Setting
- **GET** Get Setting
- **PUT** Set Setting

## `/api/v1/site-audit/crawls`
- **GET** List Crawls

## `/api/v1/site-audit/crawls/compare`
- **GET** Compare Crawls

## `/api/v1/site-audit/crawls/start`
- **POST** Start Crawl

## `/api/v1/site-audit/custom-extraction`
- **GET** Custom Extraction

## `/api/v1/site-audit/issues`
- **GET** List Issues

## `/api/v1/site-audit/issues/summary`
- **GET** Issues Summary

## `/api/v1/site-audit/log-file`
- **POST** Upload Log File

## `/api/v1/site-audit/projects`
- **GET** List Audit Projects
- **POST** Create Audit Project

## `/api/v1/site-audit/projects/{audit_id}`
- **GET** Get Audit Project

## `/api/v1/site-audit/sitemap`
- **GET** Generate Sitemap

## `/api/v1/site-explorer/anchor-text/{domain}`
- **GET** Get Anchor Text

## `/api/v1/site-explorer/backlinks/{domain}`
- **GET** Get Backlinks

## `/api/v1/site-explorer/broken-backlinks/{domain}`
- **GET** Get Broken Backlinks

## `/api/v1/site-explorer/content-gap`
- **GET** Content Gap

## `/api/v1/site-explorer/fetch/{domain}`
- **POST** Fetch Domain Data

## `/api/v1/site-explorer/link-intersect`
- **GET** Link Intersect

## `/api/v1/site-explorer/organic-keywords/{domain}`
- **GET** Get Organic Keywords

## `/api/v1/site-explorer/outgoing-links/{domain}`
- **GET** Get Outgoing Links

## `/api/v1/site-explorer/overview/{domain}`
- **GET** Domain Overview

## `/api/v1/site-explorer/paid-keywords/{domain}`
- **GET** Get Paid Keywords

## `/api/v1/site-explorer/referring-domains/{domain}`
- **GET** Get Referring Domains

## `/api/v1/social/accounts`
- **GET** List Accounts
- **POST** Create Account

## `/api/v1/social/accounts/connect`
- **POST** Connect Account Alias

## `/api/v1/social/accounts/{account_id}`
- **DELETE** Delete Account

## `/api/v1/social/analytics`
- **GET** Social Analytics Summary

## `/api/v1/social/calendar`
- **GET** Social Calendar

## `/api/v1/social/influencers`
- **GET** List Influencers
- **POST** Add Influencer

## `/api/v1/social/posts`
- **GET** List Posts
- **POST** Create Post

## `/api/v1/social/posts/{post_id}`
- **DELETE** Delete Post
- **PUT** Update Post

## `/api/v1/social/posts/{post_id}/metrics`
- **GET** Get Post Metrics

## `/api/v1/social/posts/{post_id}/publish`
- **POST** Publish Post

## `/health`
- **GET** Health
