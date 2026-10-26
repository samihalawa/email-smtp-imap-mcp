# Multi-arch Dovecot (the official image is amd64-only, which breaks on Apple Silicon)
FROM alpine:3.20
RUN apk add --no-cache dovecot \
 && addgroup -g 1000 vmail && adduser -D -u 1000 -G vmail -h /srv/mail vmail \
 && mkdir -p /srv/mail && chown vmail:vmail /srv/mail
EXPOSE 143
CMD ["dovecot", "-F"]
