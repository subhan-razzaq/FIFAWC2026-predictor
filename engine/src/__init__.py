"""WELTMEISTER offline engine.

Fits the Dixon-Coles goals model on real international results, blends it with an
Elo prior and a squad-quality prior, derives the scorer and lineup models, and
exports a compact ``model.json`` for the browser simulation engine to consume.
"""
