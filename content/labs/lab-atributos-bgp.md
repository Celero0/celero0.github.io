+++
draft = false
title = "Implementación de Atributos de BGP"
date = 2026-11-08T12:00:00Z
description = "Laboratorio de BGP: iBGP en malla completa, eBGP multihoming con dos ISP, next-hop-self, AS-path prepend, MED, summarización y redistribución con OSPF."
weight = 7
tags = []
categories = []
slug = ""
authors = []
externalLink = ""
series = []
+++

---
- Tags: #BGP #OSPF #AS-Path #MED #NextHopSelf #Summarización
---

# Introducción

Este laboratorio implementa **BGP multihoming** en dos sucursales conectadas a dos proveedores (ISP-A e ISP-B). Cada sucursal corre OSPF internamente y BGP hacia el exterior, y el objetivo es manipular los **atributos de BGP** para controlar qué camino se prefiere.

A lo largo del laboratorio se practica:

- OSPF como IGP en cada sucursal.
- iBGP en malla completa, con sesiones por loopback y por enlace directo cuando la loopback está filtrada.
- eBGP con dos proveedores.
- `next-hop-self` en los routers de borde.
- **AS-path prepend** para preferir ISP-A.
- **MED** (Multi-Exit Discriminator) para influir en el camino de retorno.
- Summarización con `aggregate-address`.
- Redistribución bidireccional OSPF ↔ BGP con `route-map`.

# Topología

<img src="/images/Pasted image 20250712203554.png" style="width:100%; height:auto; display:block; margin:auto;">

- **Sucursal A (AS 65001)**: R1, R2 y R3 en OSPF área 0. R1 tiene la LAN `192.168.10.0/24`; R3 es el router de borde hacia los dos ISP.
- **Sucursal B (AS 65002)**: R6, R7 y R8 en OSPF área 0. R8 tiene la LAN `172.16.80.0/24`; R6 es el router de borde.
- **ISP-A (AS 400)**: loopbacks `40.40.40.1/24` y `40.40.50.1/24`.
- **ISP-B (AS 500)**: loopbacks `50.50.50.1/24` y `50.50.80.1/24`.
- **Enlaces a los ISP**: `209.50.0.0/30` (R3-ISP-A), `219.50.0.0/30` (R3-ISP-B), `209.60.0.0/30` (R6-ISP-A), `219.60.0.0/30` (R6-ISP-B) y `222.0.0.0/30` (ISP-A-ISP-B).

# Requerimientos

- Habilitar OSPF como IGP con `router-id` en formato `X.X.X.X` e interfaces pasivas donde corresponda.
- R2 no debe ver la loopback de R3.
- R7 no debe ver la loopback de R8.
- Garantizar salida a Internet; los routers de borde reciben IPv4 por DHCP de los ISP.
- Implementar BGP con los AS indicados y `router-id` en formato `X.X.X.X`.
- iBGP por loopback y eBGP por IP de siguiente salto, en malla completa.
- Permitir que los routers iBGP tengan un next-hop válido.
- Hacer que R3 y R6 prefieran ISP-A mediante BGP.
- Alterar la métrica de una ruta BGP a 50.
- Sumarizar las loopbacks que participan en BGP.
- Redistribuir entre IGP y EGP con route-maps.
- Comprobar conectividad completa entre los PC.

# Desarrollo

## 1. OSPF en la Sucursal A

R1, R2 y R3 forman una vecindad OSPF en el área 0. Las loopbacks y la LAN se anuncian, y las interfaces sin vecinos se marcan como pasivas.

**R1**

```bash
en
conf t
router ospf 1
router-id 1.1.1.1
network 1.1.1.1 0.0.0.0 area 0
network 192.168.13.0 0.0.0.255 area 0
network 192.168.12.0 0.0.0.255 area 0
network 192.168.10.0 0.0.0.255 area 0
passive-interface e0/0
passive-interface l1
ex
```

**R2**

```bash
en
conf t
router ospf 1
router-id 2.2.2.2
network 2.2.2.2 0.0.0.0 area 0
network 192.168.23.0 0.0.0.255 area 0
network 192.168.12.0 0.0.0.255 area 0
passive-interface l2
ex
```

**R3**

```bash
en
conf t
router ospf 1
router-id 3.3.3.3
network 3.3.3.3 0.0.0.0 area 0
network 192.168.13.0 0.0.0.255 area 0
network 192.168.23.0 0.0.0.255 area 0
passive-interface l3
ex
```

## 2. OSPF en la Sucursal B

**R6**

```bash
en
conf t
router ospf 1
router-id 6.6.6.6
network 6.6.6.6 0.0.0.0 area 0
network 172.16.67.0 0.0.0.255 area 0
network 172.16.68.0 0.0.0.255 area 0
passive-interface l6
ex
```

**R7**

```bash
en
conf t
router ospf 1
router-id 7.7.7.7
network 7.7.7.7 0.0.0.0 area 0
network 172.16.67.0 0.0.0.255 area 0
network 172.16.69.0 0.0.0.255 area 0
passive-interface l7
ex
```

**R8**

```bash
en
conf t
router ospf 1
router-id 8.8.8.8
network 8.8.8.8 0.0.0.0 area 0
network 172.16.68.0 0.0.0.255 area 0
network 172.16.69.0 0.0.0.255 area 0
network 172.16.80.0 0.0.0.255 area 0
passive-interface l8
passive-interface e0/0
ex
```

## 3. Filtrado de loopbacks con prefix-list

### R2 no debe ver la loopback de R3

Se niega `3.3.3.3/32` a la entrada de las dos interfaces de R2. El `permit 0.0.0.0/0 le 32` final es obligatorio para no bloquear el resto de las rutas.

```bash
ip prefix-list FILTRO-1 deny 3.3.3.3/32
ip prefix-list FILTRO-1 permit 0.0.0.0/0 le 32
router ospf 1
distribute-list prefix FILTRO-1 in s1/0
distribute-list prefix FILTRO-1 in s1/2
ex
```

### R7 no debe ver la loopback de R8

```bash
ip prefix-list FILTRO-1 deny 8.8.8.8/32
ip prefix-list FILTRO-1 permit 0.0.0.0/0 le 32
router ospf 1
distribute-list prefix FILTRO-1 in s1/0
distribute-list prefix FILTRO-1 in s1/2
ex
```

> **Efecto colateral:** como R2 no ve `3.3.3.3`, la sesión iBGP R2-R3 no puede formarse por loopback y debe usar las IPs del enlace directo (`192.168.23.2` / `192.168.23.3`). Lo mismo ocurre entre R7 y R8.

## 4. Rutas por defecto y redistribución en OSPF

R3 y R6 tienen dos salidas cada uno (ISP-A e ISP-B). Se configura una ruta por defecto por cada proveedor y se inyectan en OSPF con `default-information originate`.

**R3**

```bash
ip route 0.0.0.0 0.0.0.0 209.50.0.1
ip route 0.0.0.0 0.0.0.0 219.50.0.1
router ospf 1
default-information originate
ex
```

**R6**

```bash
ip route 0.0.0.0 0.0.0.0 209.60.0.1
ip route 0.0.0.0 0.0.0.0 219.60.0.1
router ospf 1
default-information originate
ex
```

## 5. DHCP de los enlaces a los ISP

Los routers de borde reciben su IPv4 por DHCP. Los servidores DHCP están en los ISP y entregan las dos subredes `/30` de cada sucursal.

**ISP-A**

```bash
en
conf t
ip dhcp excluded-address 209.50.0.1
ip dhcp excluded-address 209.60.0.1
ip dhcp pool R3
default-router 209.50.0.1
network 209.50.0.0 255.255.255.252
ex
ip dhcp pool R6
default-router 209.60.0.1
network 209.60.0.0 255.255.255.252
ex
```

**ISP-B**

```bash
en
conf t
ip dhcp excluded-address 219.50.0.1
ip dhcp excluded-address 219.60.0.1
ip dhcp pool R3
default-router 219.50.0.1
network 219.50.0.0 255.255.255.252
ex
ip dhcp pool R6
default-router 219.60.0.1
network 219.60.0.0 255.255.255.252
ex
```

En el lado cliente, las interfaces hacia los ISP se configuran con `ip address dhcp`:

```bash
! R3
int e0/0
ip address dhcp
no shut
ex
int e0/1
ip address dhcp
no shut
ex

! R6
int e0/3
ip address dhcp
no shut
ex
int e0/1
ip address dhcp
no shut
ex
```

## 6. iBGP en malla completa

Dentro de cada AS, todos los routers forman sesiones iBGP entre sí. Las sesiones usan las loopbacks como origen (`update-source loopback`) salvo cuando la loopback está filtrada; en ese caso se usa la IP del enlace directo.

### Sucursal A (AS 65001)

**R1**

```bash
router bgp 65001
bgp router-id 1.1.1.1
address-family ipv4
network 192.168.10.0 mask 255.255.255.0
network 1.1.1.1 mask 255.255.255.255
neighbor 3.3.3.3 remote-as 65001
neighbor 3.3.3.3 update-source loopback 1
neighbor 2.2.2.2 remote-as 65001
neighbor 2.2.2.2 update-source loopback 1
ex
```

**R2**

```bash
router bgp 65001
bgp router-id 2.2.2.2
address-family ipv4
network 2.2.2.2 mask 255.255.255.255
neighbor 1.1.1.1 remote-as 65001
neighbor 1.1.1.1 update-source loopback 2
neighbor 192.168.23.3 remote-as 65001
ex
```

**R3**

```bash
router bgp 65001
bgp router-id 3.3.3.3
address-family ipv4
network 3.3.3.3 mask 255.255.255.255
neighbor 1.1.1.1 remote-as 65001
neighbor 1.1.1.1 update-source loopback 3
neighbor 192.168.23.2 remote-as 65001
ex
```

### Sucursal B (AS 65002)

**R6**

```bash
router bgp 65002
bgp router-id 6.6.6.6
address-family ipv4
network 6.6.6.6 mask 255.255.255.255
neighbor 7.7.7.7 remote-as 65002
neighbor 7.7.7.7 update-source loopback 6
neighbor 8.8.8.8 remote-as 65002
neighbor 8.8.8.8 update-source loopback 6
ex
```

**R7**

```bash
router bgp 65002
bgp router-id 7.7.7.7
address-family ipv4
network 7.7.7.7 mask 255.255.255.255
neighbor 6.6.6.6 remote-as 65002
neighbor 6.6.6.6 update-source loopback 7
neighbor 172.16.69.8 remote-as 65002
ex
```

**R8**

```bash
router bgp 65002
bgp router-id 8.8.8.8
address-family ipv4
network 8.8.8.8 mask 255.255.255.255
neighbor 6.6.6.6 remote-as 65002
neighbor 6.6.6.6 update-source loopback 8
neighbor 172.16.69.7 remote-as 65002
ex
```

## 7. eBGP con los ISP

Cada router de borde forma eBGP con ambos proveedores usando la IP del siguiente salto.

**R3**

```bash
router bgp 65001
neighbor 209.50.0.1 remote-as 400
neighbor 219.50.0.1 remote-as 500
ex
```

**R6**

```bash
router bgp 65002
neighbor 209.60.0.1 remote-as 400
neighbor 219.60.0.1 remote-as 500
ex
```

**ISP-A (AS 400)**

```bash
router bgp 400
bgp router-id 4.4.4.4
neighbor 209.50.0.2 remote-as 65001
neighbor 222.0.0.1 remote-as 500
neighbor 209.60.0.2 remote-as 65002
network 40.40.40.0 mask 255.255.255.0
network 40.40.50.0 mask 255.255.255.0
ex
```

**ISP-B (AS 500)**

```bash
router bgp 500
bgp router-id 5.5.5.5
neighbor 219.50.0.2 remote-as 65001
neighbor 222.0.0.2 remote-as 400
neighbor 219.60.0.2 remote-as 65002
network 50.50.50.0 mask 255.255.255.0
network 50.50.80.0 mask 255.255.255.0
ex
```

## 8. next-hop-self

Cuando un router iBGP recibe una ruta externa, el next-hop sigue siendo la IP del ISP, que puede no ser alcanzable dentro del AS. `next-hop-self` hace que el router de borde reescriba el next-hop con su propia dirección antes de anunciar la ruta a sus vecinos iBGP.

Para comprobar el next-hop actual:

```bash
show ip bgp
```

Si la IP del next-hop no es alcanzable, se aplica `next-hop-self` en el router de borde para cada vecino iBGP no borde.

**R3**

```bash
router bgp 65001
neighbor 192.168.23.2 next-hop-self
neighbor 1.1.1.1 next-hop-self
end
clear ip bgp * soft
conf t
```

**R6**

```bash
router bgp 65002
neighbor 7.7.7.7 next-hop-self
neighbor 8.8.8.8 next-hop-self
end
clear ip bgp * soft
conf t
```

> Si hacia una loopback hay un filtro que la hace inalcanzable, se usa la IP del enlace directo como next-hop.

## 9. AS-path prepend: preferir ISP-A

BGP elige la ruta con el **AS_PATH más corto**. Para que R3 y R6 prefieran ISP-A, se alarga artificialmente el AS_PATH de las rutas que llegan desde ISP-B: se antepone el AS local dos veces.

**R3** — rutas recibidas de ISP-B (`219.50.0.1`)

```bash
route-map ATRIBUTO-1 permit
set as-path prepend 65001 65001
ex
router bgp 65001
neighbor 219.50.0.1 route-map ATRIBUTO-1 in
end
clear ip bgp * soft
conf t
```

**R6** — rutas recibidas de ISP-B (`219.60.0.1`)

```bash
route-map ATRIBUTO-2 permit
set as-path prepend 65002 65002
ex
router bgp 65002
neighbor 219.60.0.1 route-map ATRIBUTO-2 in
end
clear ip bgp * soft
conf t
```

De este modo, las rutas que llegan por ISP-B quedan con un AS_PATH más largo y pierden frente a las que llegan por ISP-A.

## 10. Atributo MED (métrica 50)

El **MED** (Multi-Exit Discriminator) es una métrica que un AS envía a su vecino para indicarle qué entrada prefiere para el tráfico de retorno. Un MED menor es preferido.

En este laboratorio, ISP-B anuncia sus rutas a ISP-A con métrica 50:

**ISP-B**

```bash
route-map ATRIBUTO-3 permit
set metric 50
ex
router bgp 500
neighbor 222.0.0.2 route-map ATRIBUTO-3 out
end
clear ip bgp * soft
conf t
```

## 11. Summarización con aggregate-address

Cada ISP resume sus loopbacks en un solo prefijo y, con `summary-only`, deja de anunciar los prefijos individuales.

**ISP-A** — `40.40.40.0/24` y `40.40.50.0/24` → `40.40.32.0/19`

```bash
router bgp 400
aggregate-address 40.40.32.0 255.255.224.0 summary-only
ex
```

**ISP-B** — `50.50.50.0/24` y `50.50.80.0/24` → `50.50.0.0/17`

```bash
router bgp 500
aggregate-address 50.50.0.0 255.255.128.0 summary-only
ex
```

## 12. Redistribución OSPF → BGP

R3 y R6 redistribuyen las rutas OSPF hacia BGP. La `prefix-list` selecciona exactamente qué redes se anuncian y el `route-map` les asigna métrica 50.

**R3**

```bash
ip prefix-list RUTAS-OSPF permit 192.168.10.0/24
ip prefix-list RUTAS-OSPF permit 1.1.1.1/32
ip prefix-list RUTAS-OSPF permit 192.168.13.0/24
ip prefix-list RUTAS-OSPF permit 3.3.3.3/32
ip prefix-list RUTAS-OSPF permit 192.168.23.0/24
ip prefix-list RUTAS-OSPF permit 2.2.2.2/32
ip prefix-list RUTAS-OSPF permit 192.168.12.0/24
ip prefix-list RUTAS-OSPF permit 6.6.6.6/32
ip prefix-list RUTAS-OSPF permit 172.16.67.0/24
ip prefix-list RUTAS-OSPF permit 7.7.7.7/32
ip prefix-list RUTAS-OSPF permit 172.16.69.0/24
ip prefix-list RUTAS-OSPF permit 172.16.80.0/24
ip prefix-list RUTAS-OSPF permit 8.8.8.8/32
ip prefix-list RUTAS-OSPF permit 172.16.68.0/24
route-map BGP permit
match ip address prefix-list RUTAS-OSPF
set metric 50
ex
router bgp 65001
redistribute ospf 1 route-map BGP
ex
```

**R6**

```bash
ip prefix-list RUTAS-OSPF permit 192.168.10.0/24
ip prefix-list RUTAS-OSPF permit 1.1.1.1/32
ip prefix-list RUTAS-OSPF permit 192.168.13.0/24
ip prefix-list RUTAS-OSPF permit 3.3.3.3/32
ip prefix-list RUTAS-OSPF permit 192.168.23.0/24
ip prefix-list RUTAS-OSPF permit 2.2.2.2/32
ip prefix-list RUTAS-OSPF permit 192.168.12.0/24
ip prefix-list RUTAS-OSPF permit 6.6.6.6/32
ip prefix-list RUTAS-OSPF permit 172.16.67.0/24
ip prefix-list RUTAS-OSPF permit 7.7.7.7/32
ip prefix-list RUTAS-OSPF permit 172.16.69.0/24
ip prefix-list RUTAS-OSPF permit 172.16.80.0/24
ip prefix-list RUTAS-OSPF permit 8.8.8.8/32
ip prefix-list RUTAS-OSPF permit 172.16.68.0/24
route-map BGP permit
match ip address prefix-list RUTAS-OSPF
set metric 50
ex
router bgp 65002
redistribute ospf 1 route-map BGP
ex
```

## 13. Redistribución BGP → OSPF

El proceso inverso anuncia las rutas BGP dentro de OSPF. Se incluyen los enlaces a los ISP, los enlaces entre ISP y los prefijos sumarizados.

**R3**

```bash
ip prefix-list RUTAS-BGP permit 209.50.0.0/30
ip prefix-list RUTAS-BGP permit 209.60.0.0/30
ip prefix-list RUTAS-BGP permit 222.0.0.0/30
ip prefix-list RUTAS-BGP permit 219.50.0.0/30
ip prefix-list RUTAS-BGP permit 219.60.0.0/30
ip prefix-list RUTAS-BGP permit 40.40.32.0/19
ip prefix-list RUTAS-BGP permit 50.50.0.0/17
route-map OSPF permit
match ip address prefix-list RUTAS-BGP
set metric 50
ex
router ospf 1
redistribute bgp 65001 route-map OSPF subnets
ex
```

**R6**

```bash
ip prefix-list RUTAS-BGP permit 209.50.0.0/30
ip prefix-list RUTAS-BGP permit 209.60.0.0/30
ip prefix-list RUTAS-BGP permit 222.0.0.0/30
ip prefix-list RUTAS-BGP permit 219.50.0.0/30
ip prefix-list RUTAS-BGP permit 219.60.0.0/30
ip prefix-list RUTAS-BGP permit 40.40.32.0/19
ip prefix-list RUTAS-BGP permit 50.50.0.0/17
route-map OSPF permit
match ip address prefix-list RUTAS-BGP
set metric 50
ex
router ospf 1
redistribute bgp 65002 route-map OSPF subnets
ex
```

## Verificación

- **Vecindades**
  - `show ip bgp summary` — sesiones iBGP y eBGP en `Established`.
  - `show ip ospf neighbor`.
- **Tabla BGP**
  - `show ip bgp` — revisar AS_PATH, next-hop y MED de cada prefijo.
  - `show ip bgp 40.40.32.0` — debe preferir la ruta por ISP-A.
  - `show ip bgp neighbors 219.50.0.1` — ver el efecto del route-map de entrada.
- **Atributos**
  - `show ip bgp` — comparar el largo del AS_PATH entre las rutas de ISP-A y ISP-B.
  - `show ip bgp 40.40.32.0` — revisar el MED.
- **Summarización**
  - `show ip bgp` — debe aparecer `40.40.32.0/19` y `50.50.0.0/17`, sin los prefijos individuales.
- **Redistribución**
  - `show ip route ospf` y `show ip route bgp`.
  - `show ip ospf database external`.
- **Conectividad**
  - `ping` entre el PC de R1 (`192.168.10.10`) y el PC de R8 (`172.16.80.10`).
  - `traceroute` para confirmar que el tráfico sale por ISP-A.
  - `show ip route 40.40.40.0` y `show ip route 50.50.50.0` en R3/R6.

# Conclusión

El laboratorio recorre BGP multihoming completo: iBGP en malla, eBGP con dos proveedores, control del next-hop, preferencia de salida con AS-path prepend, influencia del retorno con MED, summarización y redistribución con OSPF.

Los puntos críticos al reproducirlo son: que las sesiones iBGP usen `update-source` correcto (o la IP directa cuando la loopback está filtrada), que `next-hop-self` se aplique en los routers de borde, que el AS-path prepend se aplique en la dirección correcta, y que las `prefix-list` de redistribución incluyan exactamente las redes que deben anunciarse.
