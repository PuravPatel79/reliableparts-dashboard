# backend/scraper/test_scraper.py

"""
Test script to verify the scraper is working
"""

import asyncio
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

async def test_basic_scraping():
    """Test basic scraping functionality"""
    
    # Test database connection
    print("Testing database connection...")
    try:
        db_url = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/reliableparts")
        engine = create_engine(db_url)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("✅ Database connected successfully")
            
            # Check products table
            result = conn.execute(text("SELECT COUNT(*) FROM products"))
            count = result.scalar()
            print(f"📊 Current products in database: {count}")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return
    
    # Test Redis connection
    print("\nTesting Redis connection...")
    try:
        import redis
        r = redis.Redis(host='localhost', port=6379, db=0)
        r.ping()
        print("✅ Redis connected successfully")
    except Exception as e:
        print(f"⚠️ Redis connection failed (scraper will work without cache): {e}")
    
    # Test Playwright
    print("\nTesting Playwright...")
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto("https://www.reliableparts.com")
            title = await page.title()
            print(f"✅ Playwright working - Site title: {title}")
            await browser.close()
    except Exception as e:
        print(f"❌ Playwright failed: {e}")
        print("Run: playwright install chromium")
        return
    
    print("\n" + "="*50)
    print("All systems ready! You can now run the scraper.")
    print("="*50)

async def check_scraped_data():
    """Check what data has been scraped"""
    
    db_url = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/reliableparts")
    engine = create_engine(db_url)
    
    with engine.connect() as conn:
        # Get product count
        result = conn.execute(text("SELECT COUNT(*) FROM products"))
        total = result.scalar()
        print(f"\n📊 Total products: {total}")
        
        if total > 0:
            # Get sample products
            result = conn.execute(text("""
                SELECT sku, name, price, in_stock, category, manufacturer
                FROM products 
                LIMIT 5
            """))
            
            print("\n🛒 Sample products:")
            print("-" * 80)
            for row in result:
                print(f"SKU: {row[0]}")
                print(f"Name: {row[1]}")
                print(f"Price: ${row[2]:.2f}" if row[2] else "Price: N/A")
                print(f"In Stock: {row[3]}")
                print(f"Category: {row[4]}")
                print(f"Manufacturer: {row[5]}")
                print("-" * 80)
            
            # Get category breakdown
            result = conn.execute(text("""
                SELECT category, COUNT(*) as count
                FROM products
                GROUP BY category
                ORDER BY count DESC
            """))
            
            print("\n📂 Products by category:")
            for row in result:
                print(f"  {row[0]}: {row[1]} products")
            
            # Get price statistics
            result = conn.execute(text("""
                SELECT 
                    MIN(price) as min_price,
                    MAX(price) as max_price,
                    AVG(price) as avg_price
                FROM products
                WHERE price IS NOT NULL
            """))
            
            row = result.fetchone()
            if row[0]:
                print(f"\n💰 Price statistics:")
                print(f"  Min: ${row[0]:.2f}")
                print(f"  Max: ${row[1]:.2f}")
                print(f"  Average: ${row[2]:.2f}")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "check":
        asyncio.run(check_scraped_data())
    else:
        asyncio.run(test_basic_scraping())