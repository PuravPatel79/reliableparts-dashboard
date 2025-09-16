-- DATABASE SCHEMA FOR RELIABLEPARTS DASHBOARD

-- Create database (run as superuser)
-- CREATE DATABASE reliableparts_prod;


-- EXTENSIONS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- Better indexing for composite queries
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";  -- Query performance monitoring


-- PRODUCTS TABLE

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    manufacturer VARCHAR(200),
    category VARCHAR(200) NOT NULL,
    subcategory VARCHAR(200),
    
    -- Pricing information
    price DECIMAL(10, 2),
    list_price DECIMAL(10, 2),
    cost DECIMAL(10, 2),  -- For margin calculations
    margin_percentage DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN price > 0 AND cost > 0 THEN ((price - cost) / price * 100)
            ELSE NULL
        END
    ) STORED,  -- Faster queries on margins
    
    previous_price DECIMAL(10, 2),
    price_change_date TIMESTAMP,
    price_history JSONB DEFAULT '[]',  -- Flexible price tracking
    
    -- Availability
    availability VARCHAR(50) DEFAULT 'unknown',
    in_stock BOOLEAN DEFAULT false,
    stock_quantity INTEGER DEFAULT 0,
    warehouse_locations JSONB DEFAULT '[]',
    
    -- Product details
    weight_lbs DECIMAL(8, 2),
    dimensions_inches JSONB,  -- {"length": 10, "width": 5, "height": 3}
    shipping_info TEXT,
    warranty_months INTEGER,
    
    -- Images and media
    image_url TEXT,
    additional_images JSONB DEFAULT '[]',
    video_urls JSONB DEFAULT '[]',
    manual_url TEXT,
    
    -- Specifications and compatibility
    specifications JSONB DEFAULT '{}',
    compatible_models JSONB DEFAULT '[]',
    oem_numbers JSONB DEFAULT '[]',
    replaces_parts JSONB DEFAULT '[]',
    
    -- SEO and search
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(manufacturer, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(category, '')), 'D')
    ) STORED,  -- Fast full-text search
    
    -- Metadata
    url TEXT,
    scraped_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confidence_score DECIMAL(3, 2) DEFAULT 1.0,  -- Track data quality
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    
    -- Analytics helper columns
    view_count INTEGER DEFAULT 0,
    purchase_count INTEGER DEFAULT 0,
    return_count INTEGER DEFAULT 0,
    rating_average DECIMAL(2, 1),
    rating_count INTEGER DEFAULT 0
);

-- Indexes for performance
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category, subcategory);
CREATE INDEX idx_products_manufacturer ON products(manufacturer);
CREATE INDEX idx_products_price ON products(price) WHERE price IS NOT NULL;
CREATE INDEX idx_products_in_stock ON products(in_stock) WHERE in_stock = true;
CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_products_compatible_models ON products USING GIN(compatible_models);
CREATE INDEX idx_products_oem_numbers ON products USING GIN(oem_numbers);
CREATE INDEX idx_products_updated ON products(updated_at DESC);


-- CATEGORIES TABLE

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) UNIQUE NOT NULL,
    parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    slug VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    product_count INTEGER DEFAULT 0,
    
    -- SEO
    meta_title VARCHAR(200),
    meta_description TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);


-- CUSTOMERS TABLE

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(200) UNIQUE,  -- Why: Link to external CRM
    email VARCHAR(255) UNIQUE,
    company_name VARCHAR(500),
    
    -- Contact information
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    
    -- Address
    address_line1 VARCHAR(500),
    address_line2 VARCHAR(500),
    city VARCHAR(200),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    
    -- Customer type and status
    customer_type VARCHAR(50) DEFAULT 'retail',  -- retail, wholesale, contractor
    status VARCHAR(50) DEFAULT 'active',
    credit_limit DECIMAL(10, 2),
    payment_terms VARCHAR(50),
    
    -- Preferences
    preferred_categories JSONB DEFAULT '[]',
    preferred_brands JSONB DEFAULT '[]',
    communication_preferences JSONB DEFAULT '{}',
    
    -- Analytics
    lifetime_value DECIMAL(12, 2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    last_order_date TIMESTAMP,
    average_order_value DECIMAL(10, 2),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    notes TEXT
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_company ON customers(company_name);
CREATE INDEX idx_customers_type ON customers(customer_type);

-- SALES_INTERACTIONS TABLE

CREATE TABLE IF NOT EXISTS sales_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id),
    agent_id VARCHAR(200),  -- Sales agent identifier
    
    -- Interaction details
    interaction_type VARCHAR(50) NOT NULL,  -- chat, email, phone, search
    channel VARCHAR(50),  -- web, mobile, phone
    session_id VARCHAR(200),
    
    -- Query/Request information
    query_text TEXT,
    query_intent VARCHAR(100),  -- product_search, compatibility_check, pricing, support
    query_entities JSONB DEFAULT '{}',  -- Extracted entities from NLP
    
    -- Response
    products_shown JSONB DEFAULT '[]',  -- Array of product SKUs shown
    products_clicked JSONB DEFAULT '[]',
    recommendations_made JSONB DEFAULT '[]',
    
    -- Outcome
    outcome VARCHAR(50),  -- purchased, added_to_cart, no_action, bounced
    order_id UUID,
    revenue_generated DECIMAL(10, 2),
    
    -- Timing
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    duration_seconds INTEGER,
    response_time_ms INTEGER,
    
    -- Satisfaction
    customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5),
    customer_feedback TEXT,
    
    -- AI assistance metrics
    ai_confidence_score DECIMAL(3, 2),
    ai_model_used VARCHAR(100),
    ai_suggestions_accepted INTEGER DEFAULT 0,
    ai_suggestions_rejected INTEGER DEFAULT 0
);

CREATE INDEX idx_interactions_customer ON sales_interactions(customer_id);
CREATE INDEX idx_interactions_agent ON sales_interactions(agent_id);
CREATE INDEX idx_interactions_type ON sales_interactions(interaction_type);
CREATE INDEX idx_interactions_time ON sales_interactions(started_at DESC);
CREATE INDEX idx_interactions_outcome ON sales_interactions(outcome);


-- ORDERS TABLE

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(100) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    
    -- Order details
    status VARCHAR(50) DEFAULT 'pending',
    order_type VARCHAR(50) DEFAULT 'standard',  -- standard, rush, wholesale
    
    -- Financials
    subtotal DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    shipping_amount DECIMAL(10, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    
    -- Cost and margin
    total_cost DECIMAL(10, 2),
    margin_amount DECIMAL(10, 2) GENERATED ALWAYS AS (total_amount - total_cost) STORED,
    margin_percentage DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN total_amount > 0 THEN ((total_amount - total_cost) / total_amount * 100)
            ELSE NULL
        END
    ) STORED,
    
    -- Tracking
    source VARCHAR(100),  -- website, phone, email, chat
    sales_agent_id VARCHAR(200),
    interaction_id UUID REFERENCES sales_interactions(id),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    
    -- Additional data
    notes TEXT,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_total ON orders(total_amount DESC);


-- ORDER_ITEMS TABLE

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    
    -- Item details
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(500) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    
    -- Pricing
    unit_price DECIMAL(10, 2) NOT NULL,
    unit_cost DECIMAL(10, 2),
    total_price DECIMAL(10, 2) NOT NULL,
    total_cost DECIMAL(10, 2),
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    
    -- Metadata
    is_upsell BOOLEAN DEFAULT false,
    is_cross_sell BOOLEAN DEFAULT false,
    recommendation_source VARCHAR(100),  -- ai_recommendation, frequently_bought, similar_items
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE INDEX idx_order_items_sku ON order_items(sku);


-- PRODUCT_RECOMMENDATIONS TABLE

CREATE TABLE IF NOT EXISTS product_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    recommended_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    
    recommendation_type VARCHAR(50),  -- cross_sell, upsell, substitute, accessory
    score DECIMAL(3, 2),  -- Confidence score 0-1
    
    -- Why these were recommended together
    reason VARCHAR(200),
    algorithm_version VARCHAR(50),
    
    -- Performance metrics
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    ctr DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN impressions > 0 THEN (clicks::DECIMAL / impressions * 100)
            ELSE 0
        END
    ) STORED,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(source_product_id, recommended_product_id, recommendation_type)
);

CREATE INDEX idx_recommendations_source ON product_recommendations(source_product_id);
CREATE INDEX idx_recommendations_type ON product_recommendations(recommendation_type);
CREATE INDEX idx_recommendations_score ON product_recommendations(score DESC);


-- INVENTORY_ALERTS TABLE

CREATE TABLE IF NOT EXISTS inventory_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    alert_type VARCHAR(50) NOT NULL,  -- low_stock, out_of_stock, overstock, price_change
    
    -- Alert details
    severity VARCHAR(20) DEFAULT 'medium',  -- low, medium, high, critical
    message TEXT NOT NULL,
    threshold_value DECIMAL(10, 2),
    current_value DECIMAL(10, 2),
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',  -- active, acknowledged, resolved
    acknowledged_by VARCHAR(200),
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP,
    
    -- Automation
    auto_action_taken VARCHAR(200),  -- reorder_placed, price_adjusted, notification_sent
    auto_action_details JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_product ON inventory_alerts(product_id);
CREATE INDEX idx_alerts_type ON inventory_alerts(alert_type);
CREATE INDEX idx_alerts_status ON inventory_alerts(status) WHERE status = 'active';
CREATE INDEX idx_alerts_severity ON inventory_alerts(severity);


-- ANALYTICS_DAILY_SUMMARY TABLE

CREATE TABLE IF NOT EXISTS analytics_daily_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    
    -- Sales metrics
    total_revenue DECIMAL(12, 2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    average_order_value DECIMAL(10, 2),
    total_units_sold INTEGER DEFAULT 0,
    
    -- Product metrics
    top_selling_products JSONB DEFAULT '[]',
    top_categories JSONB DEFAULT '[]',
    top_manufacturers JSONB DEFAULT '[]',
    
    -- Customer metrics
    new_customers INTEGER DEFAULT 0,
    returning_customers INTEGER DEFAULT 0,
    
    -- Interaction metrics
    total_interactions INTEGER DEFAULT 0,
    chat_interactions INTEGER DEFAULT 0,
    search_queries INTEGER DEFAULT 0,
    
    -- Conversion metrics
    conversion_rate DECIMAL(5, 2),
    cart_abandonment_rate DECIMAL(5, 2),
    
    -- Inventory metrics
    low_stock_items INTEGER DEFAULT 0,
    out_of_stock_items INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(date)
);

CREATE INDEX idx_daily_summary_date ON analytics_daily_summary(date DESC);


-- SEARCH_QUERIES TABLE

CREATE TABLE IF NOT EXISTS search_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_text TEXT NOT NULL,
    normalized_query TEXT,  -- Cleaned version for analysis
    
    -- User information
    customer_id UUID REFERENCES customers(id),
    session_id VARCHAR(200),
    
    -- Results
    results_count INTEGER DEFAULT 0,
    results_shown JSONB DEFAULT '[]',
    clicked_results JSONB DEFAULT '[]',
    
    -- Outcome
    led_to_purchase BOOLEAN DEFAULT false,
    purchase_amount DECIMAL(10, 2),
    
    -- Search metadata
    search_type VARCHAR(50),  -- text, model_number, part_number, compatibility
    filters_applied JSONB DEFAULT '{}',
    sort_order VARCHAR(50),
    
    -- Performance
    response_time_ms INTEGER,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_search_queries_text ON search_queries USING GIN(to_tsvector('english', query_text));
CREATE INDEX idx_search_queries_customer ON search_queries(customer_id);
CREATE INDEX idx_search_queries_time ON search_queries(created_at DESC);


-- TRIGGERS FOR UPDATED_AT

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_alerts_updated_at BEFORE UPDATE ON inventory_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- MATERIALIZED VIEWS FOR PERFORMANCE

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_product_performance AS
SELECT 
    p.id,
    p.sku,
    p.name,
    p.category,
    p.manufacturer,
    p.price,
    p.margin_percentage,
    COUNT(DISTINCT oi.order_id) as order_count,
    SUM(oi.quantity) as total_quantity_sold,
    SUM(oi.total_price) as total_revenue,
    AVG(oi.total_price) as avg_order_value,
    COUNT(DISTINCT o.customer_id) as unique_customers
FROM products p
LEFT JOIN order_items oi ON p.id = oi.product_id
LEFT JOIN orders o ON oi.order_id = o.id
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.sku, p.name, p.category, p.manufacturer, p.price, p.margin_percentage;

CREATE INDEX idx_mv_product_performance_revenue ON mv_product_performance(total_revenue DESC);
CREATE INDEX idx_mv_product_performance_quantity ON mv_product_performance(total_quantity_sold DESC);

-- Refresh materialized view (schedule this to run periodically)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_performance;

-- ==============================================================================
-- ROW LEVEL SECURITY (if needed)
-- ==============================================================================
-- Why: Multi-tenant security or role-based access

-- Example: Enable RLS on orders table
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create policies based on your requirements
-- CREATE POLICY orders_policy ON orders
--     FOR ALL
--     TO application_user
--     USING (sales_agent_id = current_setting('app.current_agent_id'));

-- INITIAL DATA

INSERT INTO categories (name, slug, display_order) VALUES
    ('Refrigerator Parts', 'refrigerator', 1),
    ('Dishwasher Parts', 'dishwasher', 2),
    ('Washer Parts', 'washer', 3),
    ('Dryer Parts', 'dryer', 4),
    ('Oven Parts', 'oven', 5),
    ('Microwave Parts', 'microwave', 6)
ON CONFLICT (name) DO NOTHING;