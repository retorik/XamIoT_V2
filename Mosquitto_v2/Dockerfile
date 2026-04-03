FROM iegomez/mosquitto-go-auth:2.1.0-mosquitto_2.0.15

# Copie le template de config (substitution au démarrage via sed dans l'entrypoint)
RUN mkdir -p /mosquitto/config
COPY config/mosquitto.conf.template /mosquitto/config/mosquitto.conf.template

# Pas d'apt-get : envsubst remplacé par sed dans l'entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
