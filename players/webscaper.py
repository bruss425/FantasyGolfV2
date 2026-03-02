import os
import requests
from bs4 import BeautifulSoup
import re
import time

# Configuration
RANKINGS_URL = "https://www.espn.com/golf/rankings"
IMAGE_FOLDER = "pga_headshots"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
}

def get_pga_photos(limit=150):
    if not os.path.exists(IMAGE_FOLDER):
        os.makedirs(IMAGE_FOLDER)

    print(f"Connecting to {RANKINGS_URL}...")
    response = requests.get(RANKINGS_URL, headers=HEADERS)
    if response.status_code != 200:
        print("Failed to load the page.")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    
    # ESPN uses specific class names for their tables. 
    # We look for all links that point to a player profile.
    player_links = soup.find_all('a', href=re.compile(r'/golf/player/_/id/'))

    print(f"Found {len(player_links)} player links. Downloading top {limit}...")

    for i, link in enumerate(player_links[:limit]):
        try:
            player_name = link.text.strip()
            profile_url = link['href']
            
            # Extract ID from URL: /golf/player/_/id/9478/scottie-scheffler
            # This regex looks for the numbers after "/id/"
            match = re.search(r'/id/(\d+)', profile_url)
            if not match:
                continue
                
            player_id = match.group(1)
            
            # Construct the high-res PNG URL
            img_url = f"https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/{player_id}.png&w=350&h=254"

            # Download the image
            img_data = requests.get(img_url, headers=HEADERS).content
            
            # Clean name for filename (e.g., "Scottie Scheffler" -> "Scottie_Scheffler.png")
            clean_filename = f"{player_name.replace(' ', '_')}.png"
            filepath = os.path.join(IMAGE_FOLDER, clean_filename)

            with open(filepath, 'wb') as f:
                f.write(img_data)

            print(f"[{i+1}/{limit}] Saved: {clean_filename}")
            
            # Tiny delay to be respectful to the server
            time.sleep(0.1)

        except Exception as e:
            print(f"Error downloading {player_name}: {e}")

if __name__ == "__main__":
    get_pga_photos(150)