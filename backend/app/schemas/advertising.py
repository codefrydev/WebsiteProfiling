from typing import Optional
from pydantic import BaseModel


class AdCopyRequest(BaseModel):
    product: str
    audience: Optional[str] = None
