from app.schemas.projects import ProjectCreate, ProjectUpdate, ProjectResponse
from app.schemas.rank_tracker import (
    TrackedKeywordCreate, TrackedKeywordBulkCreate, TrackedKeywordResponse,
    RankHistoryResponse, SerpSnapshotResponse, VisibilityResponse, CannibalizationResponse,
)
from app.schemas.keywords import (
    KeywordResearchRequest, KeywordResponse, KeywordClusterCreate, KeywordClusterResponse,
    KeywordListCreate, KeywordListResponse, KeywordImportRequest, AiKeywordSuggestRequest,
)
from app.schemas.site_explorer import (
    DomainProfileResponse, BacklinkResponse, ReferringDomainResponse,
    OrganicKeywordResponse, PaidKeywordResponse, ContentGapRequest, LinkIntersectRequest,
)
from app.schemas.gsc import (
    GscPropertyCreate, GscPropertyResponse, GscDataResponse,
    GscOverviewResponse, GscQueryRow, GscPageRow, GscOpportunityKeyword,
)
from app.schemas.analytics import (
    AnalyticsEventIngest, AnalyticsOverviewResponse, AnalyticsFunnelCreate,
    AnalyticsFunnelResponse, AnalyticsGoalCreate, AnalyticsGoalResponse,
    RealTimeResponse, AiTrafficResponse,
)
from app.schemas.content import (
    ContentScoreRequest, ContentScoreResponse, ContentInventoryResponse,
    TopicResearchResponse, ContentBriefRequest, ContentDraftRequest,
    MetaTagsRequest, MetaTagsResponse, ContentOptimizeRequest, ContentClusterRequest,
)
from app.schemas.brand import (
    BrandMentionResponse, AiCitationResponse, BrandScanRequest,
    AiCitationScanRequest, ShareOfVoiceResponse, TrackedPromptCreate,
)
from app.schemas.competitive import (
    DomainTrafficResponse, CompareDomainsRequest, KeywordGapRequest,
    BacklinkGapRequest, MarketSegmentCreate, MarketSegmentUpdate,
    MarketSegmentResponse, BatchAnalysisRequest, BatchAnalysisResponse,
)
