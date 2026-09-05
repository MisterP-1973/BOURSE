import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app

def main():
    try:
        with app.app.app_context():
            zip_path, filename, metadata = app.create_full_backup_archive(prefix="cli_backup")
            size_kb = round(metadata['size_bytes'] / 1024, 1)
            print("\n" + "=" * 60)
            print("  SUCCÈS : Sauvegarde complète générée avec succès !")
            print("=" * 60)
            print(f"  Fichier     : {filename}")
            print(f"  Taille      : {size_kb} Ko")
            print(f"  Emplacement : {zip_path}")
            print(f"  Positions   : {metadata.get('stocks_count', 0)}")
            print("=" * 60)
    except Exception as e:
        print(f"\n[ERREUR] Impossible de créer la sauvegarde : {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
