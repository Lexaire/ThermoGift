.PHONY: serve test

serve:
	python3 -m http.server 8000

test:
	mise exec -- bun test
