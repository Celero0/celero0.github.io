+++
draft = false
title = "Implementación de BGP Básico"
date = 2026-11-04T00:00:00Z
description = "Laboratorio de BGP básico: EIGRP en dos sucursales, vecindades iBGP/eBGP, next-hop-self, prefix-lists y redistribución con route-maps."
weight = 2
tags = []
categories = []
slug = ""
authors = []
externalLink = ""
series = []
+++

---
- Tags: #BGP #EIGRP #DHCP #Prefix-List #Route-Map
---

# Introducción

Este laboratorio conecta dos sucursales a través de un ISP usando BGP. Cada sucursal corre EIGRP internamente y BGP hacia el borde; el ISP actúa como sistema autónomo de tránsito. El objetivo es practicar el ciclo completo de un despliegue BGP:

- Direccionamiento base y loopbacks de router-id.
- EIGRP como IGP en cada sucursal.
- Rutas por defecto y redistribución estática.
- Filtrado de prefijos con `prefix-list` y `distribute-list`.
- iBGP dentro de cada AS y eBGP con el ISP.
- `next-hop-self` para que los routers internos alcancen redes externas.
- Redistribución bidireccional BGP ↔ EIGRP con `route-map` y métricas.

# Topología

<img src="/images/Pasted image 20250524201939.png" style="width:100%; height:auto; display:block; margin:auto;">

- **Sucursal A**: R1, R2 y R3. EIGRP AS 10 y BGP AS 65000.
- **Sucursal B**: R5, R6 y R7. EIGRP AS 20 y BGP AS 65100.
- **ISP**: AS 200. Conecta con R2 por `209.50.0.0/30` y con R5 por `219.50.0.0/30`, y anuncia el loopback `8.8.8.8/32`.
- **Loopbacks**: R1 `10.10.10.1/24`, R2 `20.20.20.1/24`, R3 `30.30.30.1/24` y `30.30.31.1/24`, R5 `50.50.50.1/24`, R6 `60.60.60.1/24`, R7 `70.70.70.1/24` y `70.70.71.1/24`.

# Requerimientos

- Habilitar EIGRP con el AS propuesto en ambas sucursales, dejando interfaces pasivas donde corresponda.
- Garantizar conectividad a la red externa; los routers borde deben recibir IP por DHCP del ISP.
- Filtrar las loopbacks 3 y 77 para que solo los routers que las tienen las vean en su RIB.
- Habilitar BGP con `bgp router-id` en formato `X.X.X.X`, donde `X` es el número de router.
- Las vecindades iBGP se forman por loopback y las eBGP por next-hop.
- Las loopbacks deben participar en BGP; en el ISP, anunciar su loopback dentro del EGP.
- Los routers iBGP deben usar `next-hop-self` para que las rutas externas sean alcanzables.
- Redistribuir BGP en el IGP mediante `route-map`.
- Comprobar conectividad completa en la topología.

# Desarrollo

## 1. Direccionamiento base

Se completan las loopbacks que faltaban y se corrigen las direcciones de los enlaces seriales de R2. El ISP anuncia su loopback `8.8.8.8/32`, que será la red externa de prueba.

**R1** — loopback 1

```bash
en
conf t
int l1
ip add 10.10.10.1 255.255.255.0
no shut
ex
```

**R2** — corrección de `s1/2` y `s1/0`, y loopback 2

```bash
en
conf t
int s1/2
ip add 192.168.23.2 255.255.255.0
no shut
ex
int s1/0
ip add 192.168.12.2 255.255.255.0
no shut
ex
int l2
ip add 20.20.20.1 255.255.255.0
no shut
ex
```

> En los apuntes, `s1/2` tenía `192.16.23.2` y `s1/0` tenía un error similar. La corrección deja ambas en la red `192.168.x.0/24`.

**R5** — loopback 5

```bash
en
conf t
int l5
ip add 50.50.50.1 255.255.255.0
no shut
ex
```

**R6** — loopback 6

```bash
en
conf t
int l6
ip add 60.60.60.1 255.255.255.0
no shut
ex
```

**ISP** — loopback 0

```bash
en
conf t
int l0
ip add 8.8.8.8 255.255.255.255
no shut
ex
```

## 2. EIGRP AS 10 (Sucursal A)

EIGRP mantiene la conectividad interna de la sucursal. Las interfaces que no tienen vecinos (loopbacks y la interfaz hacia el host) se marcan como `passive-interface` para que no envíen hellos.

**R1**

```bash
router eigrp 10
eigrp router-id 1.1.1.1
network 192.168.12.0 0.0.0.255
network 192.168.13.0 0.0.0.255
network 10.10.10.0 0.0.0.255
network 192.168.10.0 0.0.0.255
passive-interface e0/0
passive-interface l1
ex
```

**R2**

```bash
router eigrp 10
eigrp router-id 2.2.2.2
network 192.168.12.0 0.0.0.255
network 192.168.23.0 0.0.0.255
network 20.20.20.0 0.0.0.255
network 209.50.0.0 0.0.0.3
passive-interface l2
ex
```

**R3**

```bash
router eigrp 10
eigrp router-id 3.3.3.3
network 192.168.13.0 0.0.0.255
network 192.168.23.0 0.0.0.255
network 30.30.30.0 0.0.0.255
network 30.30.31.0 0.0.0.255
passive-interface l3
passive-interface l33
ex
```

## 3. Ruta por defecto y redistribución estática (Sucursal A)

R2 es el borde de la sucursal. Aprende la salida a Internet por una ruta estática y la redistribuye en EIGRP para que R1 y R3 la conozcan.

**R2**

```bash
ip route 0.0.0.0 0.0.0.0 209.50.0.1
router eigrp 10
redistribute static
ex
```

## 4. EIGRP AS 20 (Sucursal B)

Mismo esquema en la sucursal B, con su propio AS de EIGRP.

**R5**

```bash
router eigrp 20
eigrp router-id 5.5.5.5
network 219.50.0.0 0.0.0.3
network 50.50.50.0 0.0.0.255
network 172.16.56.0 0.0.0.255
network 172.16.57.0 0.0.0.255
passive-interface l5
ex
```

**R6**

```bash
router eigrp 20
eigrp router-id 6.6.6.6
network 172.16.56.0 0.0.0.255
network 60.60.60.0 0.0.0.255
network 172.16.60.0 0.0.0.255
network 172.16.67.0 0.0.0.255
passive-interface l6
passive-interface e0/0
ex
```

**R7**

```bash
en
conf t
router eigrp 20
eigrp router-id 7.7.7.7
network 172.16.57.0 0.0.0.255
network 172.16.67.0 0.0.0.255
network 70.70.70.0 0.0.0.255
network 70.70.71.0 0.0.0.255
passive-interface l7
passive-interface l77
ex
```

## 5. Ruta por defecto y redistribución estática (Sucursal B)

**R5**

```bash
ip route 0.0.0.0 0.0.0.0 219.50.0.1
router eigrp 20
redistribute static
ex
```

## 6. DHCP de los enlaces al ISP

El requerimiento pide que los routers borde reciban su IP por DHCP del ISP. Se definen los pools para las dos subredes `/30` y se excluyen las direcciones de los gateways.

**R7**

```bash
ip dhcp excluded-address 209.50.0.1
ip dhcp excluded-address 219.50.0.1
ip dhcp pool SUCURSALA
network 209.50.0.0 255.255.255.252
default-router 209.50.0.1
ex
ip dhcp pool SUCURSALB
network 219.50.0.0 255.255.255.252
default-router 219.50.0.1
ex
```

> **Nota:** en los apuntes originales estos pools quedaron configurados en R7. Para que R2 y R5 obtengan dirección, el servidor DHCP debe estar en el ISP (o bien usar `ip helper-address` hacia un servidor alcanzable). En el lado cliente, la interfaz hacia el ISP se configura con `ip address dhcp`:
>
> ```bash
> ! R2
> int e0/2
> ip address dhcp
> no shut
> ex
>
> ! R5
> int e0/1
> ip address dhcp
> no shut
> ex
> ```

## 7. Filtrado con prefix-list

Las loopbacks `L3` (`30.30.30.0/24`) y `L77` (`70.70.71.0/24`) no deben propagarse a los demás routers. Se logra con una `prefix-list` que niega esa red y permite todo lo demás, aplicada como `distribute-list` de salida en las interfaces de EIGRP.

<img src="/images/Pasted image 20250524235315.png" style="width:100%; height:auto; display:block; margin:auto;">

**R3** — no anunciar `30.30.30.0/24`

```bash
ip prefix-list FILTRO-1 deny 30.30.30.0/24
ip prefix-list FILTRO-1 permit 0.0.0.0/0 le 32
router eigrp 10
distribute-list prefix FILTRO-1 out s1/1
distribute-list prefix FILTRO-1 out s1/2
ex
```

<img src="/images/Pasted image 20250524235532.png" style="width:100%; height:auto; display:block; margin:auto;">

**R7** — no anunciar `70.70.71.0/24`

```bash
ip prefix-list FILTRO-2 deny 70.70.71.0/24
ip prefix-list FILTRO-2 permit 0.0.0.0/0 le 32
router eigrp 20
distribute-list prefix FILTRO-2 out s1/1
distribute-list prefix FILTRO-2 out s1/2
ex
```

## 8. iBGP AS 65000 (Sucursal A)

Dentro de la sucursal, los routers forman vecindades iBGP usando las loopbacks como origen de las sesiones (`update-source loopback`). En BGP no se anuncian los enlaces punto a punto: solo las loopbacks y las redes internas que deben ser alcanzables.

<img src="/images/Pasted image 20250525003004.png" style="width:100%; height:auto; display:block; margin:auto;">

**R1**

```bash
router bgp 65000
bgp router-id 1.1.1.1
neighbor 20.20.20.1 remote-as 65000
neighbor 20.20.20.1 update-source loopback 1
neighbor 30.30.31.1 remote-as 65000
neighbor 30.30.31.1 update-source loopback 1
network 10.10.10.0 mask 255.255.255.0
network 192.168.10.0 mask 255.255.255.0
ex
```

**R2**

```bash
router bgp 65000
bgp router-id 2.2.2.2
neighbor 10.10.10.1 remote-as 65000
neighbor 10.10.10.1 update-source loopback 2
neighbor 30.30.31.1 remote-as 65000
neighbor 30.30.31.1 update-source loopback 2
network 20.20.20.0 mask 255.255.255.0
ex
```

**R3**

```bash
router bgp 65000
bgp router-id 3.3.3.3
neighbor 10.10.10.1 remote-as 65000
neighbor 10.10.10.1 update-source loopback 33
neighbor 20.20.20.1 remote-as 65000
neighbor 20.20.20.1 update-source loopback 33
network 30.30.31.0 mask 255.255.255.0
network 30.30.30.0 mask 255.255.255.0
ex
```

## 9. iBGP AS 65100 (Sucursal B)

Mismo esquema para la sucursal B, con su propio AS.

**R5**

```bash
router bgp 65100
bgp router-id 5.5.5.5
neighbor 60.60.60.1 remote-as 65100
neighbor 60.60.60.1 update-source loopback 5
neighbor 70.70.70.1 remote-as 65100
neighbor 70.70.70.1 update-source loopback 5
network 50.50.50.0 mask 255.255.255.0
ex
```

**R6**

```bash
router bgp 65100
bgp router-id 6.6.6.6
neighbor 50.50.50.1 remote-as 65100
neighbor 50.50.50.1 update-source loopback 6
neighbor 70.70.70.1 remote-as 65100
neighbor 70.70.70.1 update-source loopback 6
network 60.60.60.0 mask 255.255.255.0
network 172.16.60.0 mask 255.255.255.0
ex
```

**R7**

```bash
router bgp 65100
bgp router-id 7.7.7.7
neighbor 60.60.60.1 remote-as 65100
neighbor 60.60.60.1 update-source loopback 7
neighbor 50.50.50.1 remote-as 65100
neighbor 50.50.50.1 update-source loopback 7
network 70.70.70.0 mask 255.255.255.0
network 70.70.71.0 mask 255.255.255.0
ex
```

## 10. eBGP con el ISP

El ISP tiene una sesión eBGP con el router borde de cada sucursal. R2 usa el AS 65000 y R5 el AS 65100; el ISP es el AS 200 en ambos casos.

<img src="/images/Pasted image 20250525010007.png" style="width:100%; height:auto; display:block; margin:auto;">

**ISP**

```bash
router bgp 200
bgp router-id 20.20.20.20
neighbor 209.50.0.2 remote-as 65000
neighbor 219.50.0.2 remote-as 65100
network 8.8.8.8 mask 255.255.255.255
ex
```

**R2**

```bash
router bgp 65000
neighbor 209.50.0.1 remote-as 200
ex
```

**R5**

```bash
router bgp 65100
neighbor 219.50.0.1 remote-as 200
ex
```

## 11. next-hop-self

Cuando R1 recibe por iBGP las redes externas que aprendió R2, el next-hop sigue siendo la IP del ISP (`209.50.0.1`), que R1 no conoce. La solución es que R2 reescriba el next-hop con su propia loopback antes de anunciar la ruta a sus vecinos iBGP.

<img src="/images/Pasted image 20250525013013.png" style="width:100%; height:auto; display:block; margin:auto;">

**R2**

```bash
router bgp 65000
neighbor 10.10.10.1 next-hop-self
neighbor 30.30.31.1 next-hop-self
ex
end
clear ip bgp * soft
```

**R5**

```bash
router bgp 65100
neighbor 60.60.60.1 next-hop-self
neighbor 70.70.70.1 next-hop-self
ex
end
clear ip bgp * soft
```

## 12. Redistribución BGP ↔ EIGRP con route-map

Para que las rutas de una sucursal lleguen a la otra (y a Internet) hay que redistribuir en ambos sentidos. Se usan `prefix-list` para seleccionar qué rutas se redistribuyen y `route-map` para asignar la métrica adecuada.

### Sucursal B (R5)

**EIGRP → BGP**: se seleccionan las redes internas de la sucursal y se les asigna métrica 50.

```bash
ip prefix-list RUTAS-EIGRP-B permit 50.50.50.0/24
ip prefix-list RUTAS-EIGRP-B permit 172.16.56.0/24
ip prefix-list RUTAS-EIGRP-B permit 172.16.57.0/24
ip prefix-list RUTAS-EIGRP-B permit 172.16.67.0/24
ip prefix-list RUTAS-EIGRP-B permit 70.70.70.0/24
ip prefix-list RUTAS-EIGRP-B permit 60.60.60.0/24
ip prefix-list RUTAS-EIGRP-B permit 172.16.60.0/24
route-map BGP-B permit
match ip address prefix-list RUTAS-EIGRP-B
set metric 50
ex
router bgp 65100
redistribute eigrp 20 route-map BGP-B
ex
```

**BGP → EIGRP**: se seleccionan la red externa y el enlace al ISP, y se asigna la métrica de EIGRP (ancho de banda, delay, confiabilidad, carga y MTU).

```bash
ip prefix-list RUTAS-BGP-B permit 219.50.0.0/30
ip prefix-list RUTAS-BGP-B permit 8.8.8.8/32
route-map EIGRP-B permit
match ip address prefix-list RUTAS-BGP-B
set metric 10000 100 255 1 1500
ex
router eigrp 20
redistribute bgp 65100 route-map EIGRP-B
ex
```

### Sucursal A (R2)

**EIGRP → BGP**

```bash
ip prefix-list RUTAS-EIGRP-A permit 20.20.20.0/24
ip prefix-list RUTAS-EIGRP-A permit 192.168.12.0/24
ip prefix-list RUTAS-EIGRP-A permit 10.10.10.0/24
ip prefix-list RUTAS-EIGRP-A permit 192.168.10.0/24
ip prefix-list RUTAS-EIGRP-A permit 192.168.13.0/24
ip prefix-list RUTAS-EIGRP-A permit 30.30.31.0/24
ip prefix-list RUTAS-EIGRP-A permit 192.168.23.0/24
route-map BGP-A permit
match ip address prefix-list RUTAS-EIGRP-A
set metric 50
ex
router bgp 65000
redistribute eigrp 10 route-map BGP-A
ex
```

**BGP → EIGRP**

```bash
ip prefix-list RUTAS-BGP-A permit 209.50.0.0/30
ip prefix-list RUTAS-BGP-A permit 8.8.8.8/32
route-map EIGRP-A permit
match ip address prefix-list RUTAS-BGP-A
set metric 10000 100 255 1 1500
ex
router eigrp 10
redistribute bgp 65000 route-map EIGRP-A
ex
```

## Verificación

- **Vecindades**
  - `show ip bgp summary` (sesiones iBGP y eBGP en estado `Established`).
  - `show ip eigrp neighbors`.
- **Rutas**
  - `show ip bgp` — revisar el next-hop de las redes externas (debe ser la loopback del borde tras `next-hop-self`).
  - `show ip route bgp` y `show ip route eigrp`.
  - `show ip route 8.8.8.8` — debe salir por el borde hacia el ISP.
- **Filtrado**
  - `show ip prefix-list`.
  - `show ip eigrp topology` en R1/R5 para confirmar que las loopbacks filtradas no aparecen.
- **Conectividad**
  - `ping 8.8.8.8 source 10.10.10.1` desde R1.
  - `ping 8.8.8.8 source 50.50.50.1` desde R5.
  - `traceroute 8.8.8.8` para ver el path sucursal → ISP.

# Conclusión

El laboratorio cubre el ciclo completo de BGP en un escenario de dos sucursales: IGP interno con EIGRP, sesiones iBGP por loopback, eBGP con el ISP, control del next-hop y redistribución selectiva con `prefix-list` + `route-map`.

Los puntos que más suelen fallar al reproducirlo son: el `update-source` de las sesiones iBGP, el `next-hop-self` en los routers borde, la coincidencia de las `prefix-list` con las redes realmente anunciadas, y la métrica de EIGRP al redistribuir desde BGP. También conviene revisar que el DHCP de los enlaces al ISP esté en el lado correcto (ISP o relay) para que R2 y R5 obtengan su dirección.
