from flask import Flask, jsonify
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
from apscheduler.schedulers.background import BackgroundScheduler
import random
import time

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# 🔐 In-memory cache
CACHE = {
    "snapdeal": {},
    "shopclues": {}
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
}

HEADERS_LIST = [
    {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/113.0'},
    {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/117.0'},
    {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/91.0'},
]

def safe_get(url):
    for attempt in range(3):
        headers = random.choice(HEADERS_LIST)
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                time.sleep(random.uniform(1, 2))
                return resp
        except requests.RequestException:
            time.sleep(2 ** attempt)
    return None

def scrape_snapdeal(query):
    products = []
    try:
        search_query = query.replace(' ', '%20')
        url = f"https://www.snapdeal.com/search?keyword={search_query}&sort=plrty"
        res = safe_get(url)
        if not res:
            return products

        soup = BeautifulSoup(res.content, "lxml")
        cards = soup.find_all("div", class_="product-tuple-listing", limit=40)

        for card in cards:
            title = card.find('p', class_='product-title').text.strip() if card.find('p', class_='product-title') else ''
            price = card.find('span', class_='lfloat product-price').text.strip() if card.find('span', class_='lfloat product-price') else ''
            href = card.find('a', class_='dp-widget-link')['href'] if card.find('a', class_='dp-widget-link') else ''
            link = "https://www.snapdeal.com" + href if href.startswith('/') else href
            rating_tag = card.find('div', class_='filled-stars')
            if rating_tag and 'style' in rating_tag.attrs:
                width = rating_tag['style'].replace('width:', '').replace('%', '').strip()
                rating = round(float(width) / 20, 1)
            else:
                rating = 'No rating'
            image_tag = card.find('img')
            image = image_tag.get('src') or image_tag.get('data-src') or image_tag.get('data-original') or ''

            products.append({
                "title": title,
                "price": price,
                "link": link,
                "rating": rating,
                "image_url": image,
                "platform": "Snapdeal"
            })
    except Exception as e:
        print("Snapdeal search error:", e)
    return products

def scrape_shopclues(query):
    products = []
    try:
        url = f"https://www.shopclues.com/search?q={query}"
        response = safe_get(url)
        if not response:
            return products

        soup = BeautifulSoup(response.content, "lxml")
        cards = soup.select(".column.col3.search_blocks")[:40]

        for card in cards:
            title_tag = card.find("h2")
            price_tag = card.find("span", class_="p_price")
            image_tag = card.find("img")
            link_tag = card.find("a")

            title = title_tag.text.strip() if title_tag else "No title"
            price = price_tag.text.strip() if price_tag else "No price"
            image_url = image_tag.get("data-img") or image_tag.get("src") if image_tag else ""
            link = link_tag.get("href") if link_tag else ""

            if title and link:
                products.append({
                    "title": title,
                    "price": price,
                    "link": link,
                    "rating": "No rating",
                    "image_url": image_url,
                    "platform": "ShopClues"
                })
    except Exception as e:
        print("ShopClues scraping error:", e)
    return products

# 🔁 Periodic cache update job
def update_cache():
    print("🔁 Auto scraping in progress...")
    search_queries = ["t-shirt", "shoes", "mobile"]

    for query in search_queries:
        CACHE["snapdeal"][query] = scrape_snapdeal(query)
        CACHE["shopclues"][query] = scrape_shopclues(query)
    print("✅ Cache updated.")

# 🕒 Cron job setup
scheduler = BackgroundScheduler()
scheduler.add_job(update_cache, 'interval', hours=5)
scheduler.start()

# 🚀 API endpoint for fetching products
@app.route("/api/products/<platform>/<query>", methods=["GET"])
def get_products(platform, query):
    data = CACHE.get(platform, {}).get(query)
    if data:
        return jsonify(data)
    else:
        if platform == "snapdeal":
            result = scrape_snapdeal(query)
            CACHE["snapdeal"][query] = result
            return jsonify(result)
        elif platform == "shopclues":
            result = scrape_shopclues(query)
            CACHE["shopclues"][query] = result
            return jsonify(result)
        else:
            return jsonify({"error": "Invalid platform"}), 400

if __name__ == "__main__":
    app.run(debug=True)
