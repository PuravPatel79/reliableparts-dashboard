from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

app = FastAPI(title="ReliableParts API", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Product(BaseModel):
    sku: str
    name: str
    category: Optional[str]
    price: Optional[float]
    in_stock: bool

@app.get("/health")
def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}

@app.get("/api/products", response_model=List[Product])
def get_products(
    category: Optional[str] = None,
    in_stock: Optional[bool] = None,
    limit: int = Query(100, le=1000)
):
    query = "SELECT sku, name, category, price, in_stock FROM products WHERE 1=1"
    params = {}
    
    if category:
        query += " AND category = :category"
        params["category"] = category
    
    if in_stock is not None:
        query += " AND in_stock = :in_stock"
        params["in_stock"] = in_stock
    
    query += " LIMIT :limit"
    params["limit"] = limit
    
    with engine.connect() as conn:
        result = conn.execute(text(query), params)
        products = [
            Product(
                sku=row[0],
                name=row[1],
                category=row[2],
                price=float(row[3]) if row[3] else None,
                in_stock=row[4]
            )
            for row in result
        ]
    
    return products

@app.get("/api/products/{sku}")
def get_product(sku: str):
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT * FROM products WHERE sku = :sku"),
            {"sku": sku}
        ).fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Product not found")
        
        return dict(result._mapping)

@app.get("/api/stats")
def get_stats():
    with engine.connect() as conn:
        stats = {}
        
        # Total products
        result = conn.execute(text("SELECT COUNT(*) FROM products")).fetchone()
        stats["total_products"] = result[0]
        
        # Products in stock
        result = conn.execute(text("SELECT COUNT(*) FROM products WHERE in_stock = true")).fetchone()
        stats["in_stock"] = result[0]
        
        # Categories
        result = conn.execute(text("SELECT COUNT(DISTINCT category) FROM products")).fetchone()
        stats["categories"] = result[0]
        
        return stats

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)