# @ninja/kage-runtime

Kage Runtime es el runtime local compartido del ecosistema Ninja AI Framework. 
Provee el proceso central que:
- Levanta un servidor HTTP local
- Expone una API para que CLI y dashboard (Forge Console) se conecten
- Gestiona el lifecycle del sistema (arranque, cierre)
- Funciona como host del event bus interno
- Sirve de punto de entrada para WebSockets (en el futuro)
