import fitz

pdf_path = r"C:\Users\81902\OneDrive\ドキュメント\04_会社関係\07_受託開発関係\02_石川組\2511228_受領資料\請求書フォーマットの件\請求書　清水建設テンプレ.pdf"
out_png = "shimizu.png"

doc = fitz.open(pdf_path)
page = doc.load_page(0)

dpi = 200
zoom = dpi / 72
pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
pix.save(out_png)

print("saved:", out_png)
