# backend/scraper/main.py
"""
ReliableParts.com Web Scraper - Production Version
Working with actual site structure
"""

import asyncio
import json
import hashlib
import re
from datetime import datetime
from typing import Dict, List, Optional, Any
from urllib.parse import urljoin, urlparse
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential
import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from google.cloud import storage
import redis
from prometheus_client import Counter, Histogram, Gauge, start_http_server
import os
import random

# ==============================================================================
# METRICS
# ==============================================================================
scrape_counter = Counter('scraper_requests_total', 'Total scraping requests', ['status', 'page_type'])
scrape_duration = Histogram('scraper_request_duration_seconds', 'Request duration', ['page_type'])
items_scraped = Counter('scraper_items_total', 'Total items scraped', ['item_type'])
error_counter = Counter('scraper_errors_total', 'Scraping errors', ['error_type'])
active_scrapers = Gauge('scraper_active_tasks', 'Currently active scraping tasks')

# ==============================================================================
# CONFIGURATION
# ==============================================================================
class ScraperConfig(BaseModel):
    """Configuration for the scraper service"""
    
    project_id: str = Field(default="reliabledashboard")
    raw_data_bucket: str = Field(default="reliabledashboard-raw-data")
    database_url: str = Field(default="")
    redis_host: str = Field(default="redis-service.production.svc.cluster.local")
    redis_port: int = Field(default=6379)
    redis_db: int = Field(default=0)
    base_url: str = Field(default="https://www.reliableparts.com")
    rate_limit_requests: int = Field(default=10)
    rate_limit_period: int = Field(default=60)
    min_delay: float = Field(default=3.0)
    max_delay: float = Field(default=6.0)
    max_retries: int = Field(default=3)
    retry_backoff: int = Field(default=2)
    max_concurrent_requests: int = Field(default=2)
    prometheus_port: int = Field(default=8000)

# ==============================================================================
# DATA MODELS
# ==============================================================================
class Product(BaseModel):
    """Product data model"""
    sku: str
    name: str
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    category: str
    price: Optional[float] = None
    availability: str = "unknown"
    in_stock: bool = False
    image_url: Optional[str] = None
    url: str
    scraped_at: datetime = Field(default_factory=datetime.utcnow)

# ==============================================================================
# SCRAPER CORE
# ==============================================================================
class ReliablePartsScraper:
    """Main scraper class for ReliableParts.com"""
    
    def __init__(self, config: ScraperConfig):
        self.config = config
        self.logger = self._setup_logging()
        self.redis_client = self._setup_redis()
        self.db_session = self._setup_database()
        self.storage_client = self._setup_storage()
        self.semaphore = asyncio.Semaphore(config.max_concurrent_requests)
        self.scraped_urls = set()
        
    def _setup_logging(self) -> structlog.BoundLogger:
        """Configure structured logging"""
        structlog.configure(
            processors=[
                structlog.stdlib.filter_by_level,
                structlog.stdlib.add_logger_name,
                structlog.stdlib.add_log_level,
                structlog.stdlib.PositionalArgumentsFormatter(),
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.processors.UnicodeDecoder(),
                structlog.processors.JSONRenderer()
            ],
            context_class=dict,
            logger_factory=structlog.stdlib.LoggerFactory(),
            cache_logger_on_first_use=True,
        )
        return structlog.get_logger()
    
    def _setup_redis(self) -> Optional[redis.Redis]:
        """Setup Redis connection for caching and rate limiting"""
        try:
            r = redis.Redis(
                host=self.config.redis_host,
                port=self.config.redis_port,
                db=self.config.redis_db,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            r.ping()
            self.logger.info(f"Redis connected: {self.config.redis_host}")
            return r
        except Exception as e:
            self.logger.warning(f"Redis connection failed: {e}")
            return None
    
    def _setup_database(self):
        """Setup database connection"""
        try:
            database_url = self.config.database_url or os.getenv("DATABASE_URL")
            if not database_url:
                self.logger.error("No DATABASE_URL configured")
                return None
            
            engine = create_engine(
                database_url,
                pool_size=5,
                max_overflow=10,
                pool_pre_ping=True
            )
            
            Session = sessionmaker(bind=engine)
            session = Session()
            
            # Test connection
            session.execute(text("SELECT 1"))
            self.logger.info("Database connected successfully")
            return session
        except Exception as e:
            self.logger.error(f"Database connection failed: {e}")
            return None
    
    def _setup_storage(self):
        """Setup Google Cloud Storage"""
        try:
            client = storage.Client(project=self.config.project_id)
            self.logger.info("GCS client initialized")
            return client
        except Exception as e:
            self.logger.warning(f"GCS setup failed: {e}")
            return None
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=4, max=10)
    )
    async def fetch_page(self, url: str) -> str:
        """Fetch page using HTTPX"""
        async with self.semaphore:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
            }
            
            async with httpx.AsyncClient(
                headers=headers,
                follow_redirects=True,
                timeout=httpx.Timeout(30.0)
            ) as client:
                try:
                    with scrape_duration.labels(page_type='static').time():
                        response = await client.get(url)
                        response.raise_for_status()
                    
                    scrape_counter.labels(status='success', page_type='static').inc()
                    return response.text
                    
                except Exception as e:
                    scrape_counter.labels(status='error', page_type='static').inc()
                    error_counter.labels(error_type=type(e).__name__).inc()
                    self.logger.error(f"Fetch failed: {url} - {str(e)[:100]}")
                    raise
    
    def parse_product(self, html: str, url: str) -> Optional[Product]:
        """Parse product details from HTML"""
        soup = BeautifulSoup(html, 'lxml')
        
        try:
            # Extract SKU from URL (e.g., wpl-wp3149400.html)
            sku_match = re.search(r'/([a-zA-Z0-9\-]+)\.html', url)
            sku = sku_match.group(1) if sku_match else None
            
            # Get product name from H1
            name = None
            h1 = soup.find('h1')
            if h1:
                name = h1.get_text(strip=True)
            
            # Extract manufacturer from name or page
            manufacturer = None
            if name:
                # Common patterns: "WP3149400 Whirlpool Range..."
                brand_match = re.search(r'\b(Whirlpool|GE|LG|Samsung|Kenmore|Maytag|Frigidaire|Bosch|KitchenAid)\b', name, re.I)
                if brand_match:
                    manufacturer = brand_match.group(1)
            
            # Get price
            price = None
            # Look for price in JavaScript variables or structured data
            try:
                # Find the price element by its CSS selector
                price_element = soup.select_one('.product-info-price .price')
                
                if price_element:
                    # Clean up the text (remove '$', ',', etc.) and convert to float
                    price_text = price_element.get_text(strip=True)
                    price = float(re.sub(r'[^\d.]', '', price_text))

            except (ValueError, TypeError) as e:
                self.logger.warning(f"Could not parse price for {url}: {e}")
                price = None
            
            # Check stock status
            page_text = soup.get_text().lower()
            in_stock = 'in stock' in page_text and 'out of stock' not in page_text
            availability = "in_stock" if in_stock else "out_of_stock"
            
            # Get category from breadcrumb or URL
            category = "Parts"  # Default
            breadcrumb = soup.find('div', class_='breadcrumb')
            if breadcrumb:
                links = breadcrumb.find_all('a')
                if len(links) > 1:
                    category = links[1].get_text(strip=True)
            
            # Create product
            if sku and name:
                product = Product(
                    sku=sku.upper(),
                    name=name[:500],  # Limit name length
                    manufacturer=manufacturer,
                    category=category,
                    price=price,
                    availability=availability,
                    in_stock=in_stock,
                    url=url
                )
                
                items_scraped.labels(item_type='product').inc()
                self.logger.info(f"Parsed: {product.sku} - {product.name[:50]}")
                return product
            
        except Exception as e:
            self.logger.error(f"Parse error: {url} - {str(e)[:100]}")
            error_counter.labels(error_type='parse_error').inc()
        
        return None
    
    async def save_to_database(self, product: Product):
        """Save product to database"""
        if not self.db_session:
            return
        
        try:
            query = text("""
                INSERT INTO products (
                    sku, name, manufacturer, category,
                    price, availability, in_stock, url, scraped_at
                ) VALUES (
                    :sku, :name, :manufacturer, :category,
                    :price, :availability, :in_stock, :url, :scraped_at
                )
                ON CONFLICT (sku) DO UPDATE SET
                    name = EXCLUDED.name,
                    price = EXCLUDED.price,
                    availability = EXCLUDED.availability,
                    in_stock = EXCLUDED.in_stock,
                    scraped_at = EXCLUDED.scraped_at,
                    previous_price = products.price,
                    price_change_date = CASE 
                        WHEN products.price != EXCLUDED.price THEN CURRENT_TIMESTAMP
                        ELSE products.price_change_date
                    END
            """)
            
            self.db_session.execute(query, {
                'sku': product.sku,
                'name': product.name,
                'manufacturer': product.manufacturer,
                'category': product.category,
                'price': product.price,
                'availability': product.availability,
                'in_stock': product.in_stock,
                'url': product.url,
                'scraped_at': product.scraped_at
            })
            
            self.db_session.commit()
            self.logger.info(f"Saved: {product.sku}")
            
        except Exception as e:
            self.db_session.rollback()
            self.logger.error(f"DB save failed: {str(e)[:100]}")
    
    async def discover_products_from_category(self, category_url: str) -> List[str]:
        """Discover product URLs from category pages"""
        product_urls = []
        
        try:
            self.logger.info(f"Discovering products from: {category_url}")
            html = await self.fetch_page(category_url)
            soup = BeautifulSoup(html, 'lxml')
            
            # Find all links
            all_links = soup.find_all('a', href=True)
            
            # First, look for direct product links
            for link in all_links:
                href = link['href']
                # Look for product patterns - simplified to catch actual products
                if ('wpl-' in href.lower() or 
                    'wpw' in href.lower() or 
                    '/w10' in href.lower() or  # Common Whirlpool pattern
                    '/w11' in href.lower() or  # Another common pattern
                    re.match(r'.*/[a-z]{3}-[a-zA-Z0-9]+\.html', href)):
                    if 'category' not in href and 'parts' not in href:
                        full_url = urljoin(self.config.base_url, href)
                        product_urls.append(full_url)
            
            # If no products found, look for brand pages and scrape those
            if len(product_urls) == 0:
                # Extract category path (e.g., '/oven-parts/' from '/oven-parts.html')
                category_path = category_url.split('/')[-1].replace('.html', '')
                
                # Find brand links (e.g., /oven-parts/whirlpool.html)
                brand_links = []
                for link in all_links:
                    href = link['href']
                    if f'/{category_path}/' in href and href.endswith('.html'):
                        brand_links.append(href)
                
                self.logger.info(f"Found {len(brand_links)} brand pages in {category_path}")
                
                # Visit each brand page (limit to avoid overwhelming)
                for brand_link in brand_links[:10]:  # Limit to 10 brands
                    try:
                        brand_url = urljoin(self.config.base_url, brand_link)
                        self.logger.info(f"Checking brand page: {brand_url}")
                        
                        brand_html = await self.fetch_page(brand_url)
                        brand_soup = BeautifulSoup(brand_html, 'lxml')
                        
                        # Find product links on brand page
                        brand_product_links = brand_soup.find_all('a', href=True)
                        for link in brand_product_links:
                            href = link['href']
                            if ('wpl-' in href.lower() or 
                                'wpw' in href.lower() or 
                                '/w10' in href.lower() or
                                '/w11' in href.lower()):
                                full_url = urljoin(self.config.base_url, href)
                                product_urls.append(full_url)
                        
                        # Stop if we have enough products
                        if len(product_urls) >= 20:
                            break
                            
                    except Exception as e:
                        self.logger.error(f"Failed to process brand page: {brand_link} - {str(e)[:100]}")
                        continue
            
            # Also check brand pages
            brand_links = [a['href'] for a in all_links if re.match(r'.*/[a-z\-]+\.html$', a['href'])]
            for brand_link in brand_links[:3]:  # Limit brand pages
                if any(brand in brand_link.lower() for brand in ['whirlpool', 'ge', 'lg', 'samsung', 'kenmore']):
                    brand_url = urljoin(self.config.base_url, brand_link)
                    self.logger.info(f"Checking brand page: {brand_url}")
                    try:
                        brand_html = await self.fetch_page(brand_url)
                        brand_soup = BeautifulSoup(brand_html, 'lxml')
                        brand_product_links = brand_soup.find_all('a', href=True)
                        for link in brand_product_links:
                            href = link['href']
                            if re.match(r'.*[a-zA-Z]{2,}-[a-zA-Z0-9]+\.html', href):
                                full_url = urljoin(self.config.base_url, href)
                                product_urls.append(full_url)
                    except:
                        pass
            
            unique_urls = list(set(product_urls))
            self.logger.info(f"Found {len(unique_urls)} unique products")
            return unique_urls[:20]  # Limit to 20 products per category
            
        except Exception as e:
            self.logger.error(f"Discovery failed: {str(e)[:100]}")
            return []
    
    async def scrape_product(self, url: str):
        """Scrape a single product"""
        active_scrapers.inc()
        
        try:
            if url in self.scraped_urls:
                return
            
            self.logger.info(f"Scraping: {url}")
            html = await self.fetch_page(url)
            product = self.parse_product(html, url)
            
            if product:
                await self.save_to_database(product)
                self.scraped_urls.add(url)
                
                # Respectful delay
                delay = random.uniform(self.config.min_delay, self.config.max_delay)
                await asyncio.sleep(delay)
            
        except Exception as e:
            self.logger.error(f"Scrape failed: {url} - {str(e)[:100]}")
        finally:
            active_scrapers.dec()
    
    async def run(self):
        """Main scraping loop"""
        self.logger.info(f"Starting scraper - {self.config.model_dump()}")
        
        # Start Prometheus metrics server
        start_http_server(self.config.prometheus_port)
        self.logger.info(f"Metrics available on port {self.config.prometheus_port}")
        
        # Category pages to scrape
        categories = [
            # Main Categories
            'oven-parts.html',
            'refrigerator-parts.html',
            'dishwasher-parts.html',
            'washer-parts.html',
            'dryer-parts.html',
            'microwave-parts.html',
            'range-hood-parts.html',
            'freezer-parts.html',
            'garbage-disposal-parts.html',
            'ice-maker-parts.html',
            'water-heater-parts.html',
            'air-conditioner-parts.html',
            
            # Refrigerator Specific Parts
            'water-filters.html',
            'refrigerator-door-seals.html',
            'refrigerator-shelves.html',
            'refrigerator-drawers.html',
            'ice-maker-parts.html',
            'refrigerator-compressors.html',
            'refrigerator-fans.html',
            'refrigerator-thermostats.html',
            'refrigerator-control-boards.html',
            'refrigerator-door-handles.html',
            'refrigerator-light-bulbs.html',
            'refrigerator-water-lines.html',
            
            # Washer Specific Parts
            'washer-pumps.html',
            'washer-belts.html',
            'washer-agitators.html',
            'washer-door-seals.html',
            'washer-control-boards.html',
            'washer-motors.html',
            'washer-suspension-rods.html',
            'washer-water-valves.html',
            'washer-lid-switches.html',
            'washer-timers.html',
            'washer-drain-hoses.html',
            
            # Dryer Specific Parts
            'dryer-belts.html',
            'dryer-heating-elements.html',
            'dryer-thermostats.html',
            'dryer-motors.html',
            'dryer-drums.html',
            'dryer-lint-filters.html',
            'dryer-door-seals.html',
            'dryer-control-boards.html',
            'dryer-rollers.html',
            'dryer-fuses.html',
            'dryer-vents.html',
            
            # Dishwasher Specific Parts
            'dishwasher-pumps.html',
            'dishwasher-spray-arms.html',
            'dishwasher-door-seals.html',
            'dishwasher-racks.html',
            'dishwasher-control-boards.html',
            'dishwasher-motors.html',
            'dishwasher-door-latches.html',
            'dishwasher-water-valves.html',
            'dishwasher-silverware-baskets.html',
            'dishwasher-wheels.html',
            'dishwasher-detergent-dispensers.html',
            
            # Oven/Range Specific Parts
            'oven-heating-elements.html',
            'oven-igniters.html',
            'oven-thermostats.html',
            'oven-door-seals.html',
            'oven-control-boards.html',
            'oven-knobs.html',
            'oven-racks.html',
            'oven-light-bulbs.html',
            'oven-door-hinges.html',
            'range-burners.html',
            'range-grates.html',
            'range-surface-elements.html',
            
            # Microwave Specific Parts
            'microwave-turntables.html',
            'microwave-door-handles.html',
            'microwave-magnetrons.html',
            'microwave-diodes.html',
            'microwave-capacitors.html',
            'microwave-door-switches.html',
            'microwave-control-boards.html',
            'microwave-light-bulbs.html',
            'microwave-fuses.html',
            'microwave-waveguide-covers.html',
            
            # Common Replacement Parts
            'water-filters.html',
            'control-boards.html',
            'motors.html',
            'pumps.html',
            'belts.html',
            'door-seals.html',
            'heating-elements.html',
            'thermostats.html',
            'knobs-and-handles.html',
            'light-bulbs.html',
            'fuses.html',
            'valves.html',
            'switches.html',
            'capacitors.html',
            'fan-blades.html',
        ]
        
        while True:
            try:
                for category_path in categories:
                    category_url = urljoin(self.config.base_url, category_path)
                    
                    # Discover products
                    product_urls = await self.discover_products_from_category(category_url)
                    
                    # Scrape products
                    for url in product_urls[:10]:  # Limit per category
                        await self.scrape_product(url)
                    
                    # Delay between categories
                    await asyncio.sleep(30)
                
                # Check database status
                if self.db_session:
                    result = self.db_session.execute(text("SELECT COUNT(*) FROM products WHERE scraped_at > NOW() - INTERVAL '1 hour'"))
                    recent_count = result.scalar()
                    self.logger.info(f"Products scraped in last hour: {recent_count}")
                
                # Wait before next cycle
                self.logger.info("Cycle complete, waiting 30 minutes")
                await asyncio.sleep(1800)  # 30 minutes
                
            except Exception as e:
                self.logger.error(f"Cycle error: {str(e)[:100]}")
                await asyncio.sleep(300)  # 5 minutes on error

# ==============================================================================
# MAIN
# ==============================================================================
if __name__ == "__main__":
    config = ScraperConfig(
        project_id=os.getenv("PROJECT_ID", "reliabledashboard"),
        database_url=os.getenv("DATABASE_URL", ""),
        redis_host=os.getenv("REDIS_HOST", "redis-service.production.svc.cluster.local"),
        redis_port=int(os.getenv("REDIS_PORT", "6379")),
        base_url=os.getenv("BASE_URL", "https://www.reliableparts.com"),
        rate_limit_requests=int(os.getenv("RATE_LIMIT_REQUESTS", "10")),
        min_delay=float(os.getenv("MIN_DELAY", "3.0")),
        max_delay=float(os.getenv("MAX_DELAY", "6.0")),
        prometheus_port=int(os.getenv("PROMETHEUS_PORT", "8000"))
    )
    
    scraper = ReliablePartsScraper(config)
    asyncio.run(scraper.run())