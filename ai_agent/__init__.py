"""AIAgent - a real-time, multimodal assistant that can see, hear, and talk
through a laptop (webcam + screen + microphone + speaker).

The "brain" is a large multimodal model. By default it runs fully offline and
local (Ollama vision model + on-device speech), and upgrades automatically to
Google Gemini 2.x as soon as an API key is present in config.json / the
GEMINI_API_KEY environment variable.
"""

__version__ = "1.0.0"
__app_name__ = "AIAgent"
