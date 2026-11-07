"""Generates small synthetic encrypted PDFs with pypdf (an independent
implementation) so the decryption code is tested against files it did not
create itself. Run: python3 tests/fixtures/generate_encrypted.py"""
from pathlib import Path
from pypdf import PdfWriter, PdfReader
from io import BytesIO

here = Path(__file__).parent
base = PdfWriter()
base.add_blank_page(300, 300)
base.add_metadata({"/Title": "Encrypted fixture"})
buf = BytesIO()
base.write(buf)

for alg in ["RC4-40", "RC4-128", "AES-128", "AES-256"]:
    w = PdfWriter(clone_from=PdfReader(BytesIO(buf.getvalue())))
    w.encrypt(user_password="user123", owner_password="owner456", algorithm=alg)
    w.write(here / f"pypdf-{alg.lower()}.pdf")

# Owner-password-only (opens without a password, restrictions apply)
w = PdfWriter(clone_from=PdfReader(BytesIO(buf.getvalue())))
w.encrypt(user_password="", owner_password="owner456", algorithm="AES-128", permissions_flag=0b0100)
w.write(here / "pypdf-owner-only.pdf")
print("written")
