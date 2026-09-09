"""
GTFS Downloader for Île-de-France Mobilités (IDFM)
Fetches the official GTFS static archive from transport.data.gouv.fr / IDFM Open Data.
"""

import os
import sys
import requests
from tqdm import tqdm

GTFS_URL = "https://www.data.gouv.fr/api/1/datasets/r/413988ed-d340-467b-8be2-7b999fcd207a"


def download_gtfs(output_path: str, force: bool = False) -> str:
    """
    Downloads the IDFM GTFS zip archive if not already downloaded.
    Returns the path to the downloaded zip.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    if os.path.exists(output_path) and not force:
        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        if size_mb > 50:  # Valid archive is ~110 MB
            print(f"[fetch] GTFS archive already exists: {output_path} ({size_mb:.1f} MB)")
            return output_path
        else:
            print(f"[fetch] Existing archive seems incomplete ({size_mb:.1f} MB), re-downloading...")

    print(f"[fetch] Downloading IDFM GTFS from {GTFS_URL} ...")
    response = requests.get(GTFS_URL, stream=True, timeout=60)
    response.raise_for_status()

    total_size = int(response.headers.get("content-length", 0))
    block_size = 1024 * 1024  # 1 MB chunk

    with open(output_path, "wb") as f, tqdm(
        total=total_size, unit="iB", unit_scale=True, desc="Downloading GTFS"
    ) as progress_bar:
        for chunk in response.iter_content(chunk_size=block_size):
            if chunk:
                f.write(chunk)
                progress_bar.update(len(chunk))

    print(f"[fetch] Download complete: {output_path} ({os.path.getsize(output_path) / 1024 / 1024:.1f} MB)")
    return output_path


if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    target = os.path.join(base_dir, "data", "raw", "IDFM-gtfs.zip")
    download_gtfs(target)
