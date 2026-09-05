import os
import sys

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app

def main():
    backups_dir = app.BACKUP_DIR
    if not os.path.exists(backups_dir):
        print("\n[ERREUR] Aucun dossier 'backups/' trouvé.")
        sys.exit(0)

    files = [f for f in os.listdir(backups_dir) if f.endswith('.zip')]
    files.sort(key=lambda x: os.path.getmtime(os.path.join(backups_dir, x)), reverse=True)

    if not files:
        print("\n[INFO] Aucune archive de sauvegarde .zip trouvée dans 'backups/'.")
        sys.exit(0)

    print("\n" + "=" * 65)
    print("  POINTS DE RESTAURATION DISPONIBLES DANS 'backups/'")
    print("=" * 65)
    for idx, f in enumerate(files, start=1):
        fp = os.path.join(backups_dir, f)
        size_kb = round(os.path.getsize(fp) / 1024, 1)
        tag = " [Sécurité]" if "safety_snapshot" in f else ""
        print(f"  [{idx}] {f} ({size_kb} Ko){tag}")
    print("=" * 65)

    try:
        choice = input("\nEntrez le numéro du point à restaurer (ou Entrée pour annuler) : ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nOpération annulée.")
        sys.exit(0)

    if not choice:
        print("Opération annulée.")
        sys.exit(0)

    try:
        choice_idx = int(choice) - 1
        if 0 <= choice_idx < len(files):
            selected_file = os.path.join(backups_dir, files[choice_idx])
            print(f"\nVous avez sélectionné : {files[choice_idx]}")
            confirm = input("Confirmer la restauration ? Un point d'urgence sera créé. (O/N) : ").strip().upper()
            if confirm in ('O', 'OUI', 'Y', 'YES'):
                with app.app.app_context():
                    res = app.restore_from_archive_file(selected_file, is_upload=False)
                    if res:
                        print("\n" + "=" * 65)
                        print("  >>> SUCCÈS : Restauration terminée avec succès !")
                        for item in res:
                            print(f"   - {item}")
                        print("=" * 65)
                    else:
                        print("\n>>> [SUCCÈS] Restauration terminée.")
            else:
                print("Restauration annulée.")
        else:
            print("Numéro invalide.")
    except Exception as e:
        print(f"\n[ERREUR] : {e}")

if __name__ == "__main__":
    main()
