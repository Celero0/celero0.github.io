+++ 
draft = false
date = 2026-04-01T04:04:12Z
title = "JinjaCare Web Challenge - HackTheBox"
description = "Este es un desafío web de nivel VeryEasy de la plataforma HackTheBox, en el cual se toca la vulnerabilidad Server Side Template Injection (SSTI)"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-------------------------
- Tags: #Challenge #SSTI #VeryEasy #Jinja2
----------------
# Introducción

En este writeup detallaremos la solución paso a paso de un desafío de la categoría Web de HackTheBox, cuyo entorno gira en torno a JinjaCare  un portal de registro y descarga de certificados de vacunación.

El objetivo principal de este reto es comprender y explotar una de las vulnerabilidades más críticas en aplicaciones web modernas: el `ServerSide Template Injection (SSTI)`. A lo largo del desafío, veremos cómo una funcionalidad aparentemente inofensiva (la generación de un certificado en PDF que refleja nuestros datos personales) se convierte en un vector de ataque directo cuando los `inputs` del usuario no son sanitizados correctamente por el motor de plantillas de backend.

Como el propio nombre de la aplicación sugiere, nos enfrentaremos al motor de plantillas `jinja2` de Python. Nuestro recorrido abarcará desde la enumeración básica y registro de usuario, hasta la inyección de payloads en nuestro perfil para lograr `Ejecución Remota de Comandos (RCE)` como el usuario `root`, lo que finalmente nos permitirá leer la flag del sistema.

# Solución

Empezamos el desafío con la IP que nos proporciona `HackTheBox`, la cual es `154.57.164.73:31634`.

Al entrar a la IP nos encontramos con la siguiente página web

<img src="/images/Pasted image 20260401003907.png" style="width:100%; height:auto; display:block; margin:auto;">

En cuanto a lo relevante tenemos un `login`, en el cual nos podemos registrar

<img src="/images/Pasted image 20260401003940.png" style="width:100%; height:auto; display:block; margin:auto;">

Nos registramos de la siguiente forma

<img src="/images/Pasted image 20260401004018.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora iniciamos sesión, encontrándonos con el siguiente dashboard

<img src="/images/Pasted image 20260401004059.png" style="width:100%; height:auto; display:block; margin:auto;">

Si le damos a la opción `Download Certificate`, nos descarga el certificado de vacunación en PDF

<img src="/images/Pasted image 20260401004142.png" style="width:100%; height:auto; display:block; margin:auto;">

Como dato relevante, vemos que nuestro nombre sale reflejado en el certificado, lo cual permite una vía potencial de realizar un `Server Side Template Injection`

Si vamos al apartado de `Personal Info`, nos dan la opción de modificar el campo de `Full name`

<img src="/images/Pasted image 20260401004317.png" style="width:100%; height:auto; display:block; margin:auto;">

## Explotando SSTI

Buscando en `PayloadsAllTheThings` (http://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Server%20Side%20Template%20Injection/Python.md#jinja2) por payloads de `SSTI` encontramos que hay opciones para `Jinja2`, como la página se llama `JinjaCare` probaremos estos en un principio

<img src="/images/Pasted image 20260401004538.png" style="width:100%; height:auto; display:block; margin:auto;">

Utilizaremos el siguiente payload para nuestro campo de `Full Name`

```bash
{{4*4}}[[5*5]]
```

<img src="/images/Pasted image 20260401004619.png" style="width:100%; height:auto; display:block; margin:auto;">

Guardamos y ahora volvemos a descargar el certificado, teniendo como resultado, que la operación `{{4*4}}` se interpretó, mostrándonos el número 16, por tanto nos confirma la vulnerabilidad `SSTI`.

<img src="/images/Pasted image 20260401004658.png" style="width:100%; height:auto; display:block; margin:auto;">

Para realizar ejecución remota de comandos tenemos el siguiente payload

<img src="/images/Pasted image 20260401004814.png" style="width:100%; height:auto; display:block; margin:auto;">

Guardamos los cambios igual que antes

<img src="/images/Pasted image 20260401004848.png" style="width:100%; height:auto; display:block; margin:auto;">

Y al descargar el certificado, vemos que se ejecuta el comando correctamente, y podemos ver que el usuario el cual ejecuta los comandos es `root`

<img src="/images/Pasted image 20260401004931.png" style="width:100%; height:auto; display:block; margin:auto;">

## Obteniendo la Flag

Sabiendo que ahora podemos ejecutar comandos como el usuario `root`, ahora solo quedaría encontrar la `flag` y leerla, para ello utilizaremos el siguiente comando

```bash
find / -name *flag.txt* 2>/dev/null
```

Incorporado en el payload anterior quedaría así

```bash
{{ self.__init__.__globals__.__builtins__.__import__('os').popen('find / -name *flag.txt* 2>/dev/null').read() }}
```

Nos volvemos a cambiar el nombre

<img src="/images/Pasted image 20260401005140.png" style="width:100%; height:auto; display:block; margin:auto;">

Descargamos el certificado, y nos muestra que el archivo que necesitamos está en el directorio raíz

<img src="/images/Pasted image 20260401005204.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto para leerlo solo debemos ocupar el siguiente payload

```bash
{{ self.__init__.__globals__.__builtins__.__import__('os').popen('cat /flag.txt').read() }}
```

<img src="/images/Pasted image 20260401005246.png" style="width:100%; height:auto; display:block; margin:auto;">

Descargamos el certificado, y obtenemos la flag, completando el challenge

<img src="/images/Pasted image 20260401005317.png" style="width:100%; height:auto; display:block; margin:auto;">
