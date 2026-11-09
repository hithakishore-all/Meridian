# Re-record the captioned walkthrough video of the clickable demo (needs Python 3.11+, `pip install playwright`, ffmpeg).
#   make video                                  # films the live demo
#   make video URL=http://127.0.0.1:8000/meridian/ FONTS=path/to/node_modules/@fontsource
URL ?= https://hithakishore-all.github.io/meridian/
OUT ?= .walkthrough

.PHONY: video
video:
	rm -rf $(OUT)
	python3 scripts/record_walkthrough.py $(OUT) --url $(URL) $(if $(FONTS),--fonts $(FONTS))
	python3 scripts/encode_walkthrough.py $(OUT) $(OUT)/meridian-walkthrough.mp4 $(OUT)/meridian-walkthrough-poster.jpg
