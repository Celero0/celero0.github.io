+++
draft = false
title = "MPLS VPN de Capa 3"
date = 2026-11-06T00:00:00Z
description = "Laboratorio de MPLS VPN L3: backbone MPLS con LDP, rangos de etiquetas, VRF, MP-BGP VPNv4 y conectividad entre sucursales."
weight = 3
tags = []
categories = []
slug = ""
authors = []
externalLink = ""
series = []
+++

---
- Tags: #MPLS #LDP #VPN #BGP #VRF #MP-BGP
---

# Introducción

En este laboratorio se implementa una **VPN MPLS de capa 3** sobre un backbone de proveedor. La red del proveedor está formada por cuatro routers P (P1–P4) y dos routers PE (PE5 y PE6), mientras que dos clientes (A y B) tienen una sucursal en cada extremo.

El objetivo es practicar el ciclo completo de un servicio MPLS L3VPN:

- Habilitar MPLS y LDP en el backbone.
- Distribuir etiquetas y ajustar el rango por router.
- Seleccionar el path con el costo de OSPF.
- Crear VRFs por cliente con RD y route-targets.
- Configurar MP-BGP con address-family VPNv4.
- Formar sesiones BGP con los routers de cliente (CE).
- Resolver la repetición de AS con `allowas-in`.

# Topología

<img src="/images/Pasted image 20251122201711.png" style="width:100%; height:auto; display:block; margin:auto;">

- **P1, P2, P3 y P4**: routers del core MPLS. Corren OSPF en el área 0 y no tienen VRFs de clientes.
- **PE5 y PE6**: routers de borde del proveedor. Conectan a los clientes y forman iBGP entre sí (AS 65100).
- **CLIENTE_A1** (AS 65200) y **CLIENTE_A2** (AS 65300): sucursales del cliente A. Loopbacks `192.168.10.10/32` y `192.168.20.20/32`.
- **CLIENTE_B1** y **CLIENTE_B2** (AS 65400): sucursales del cliente B. Loopbacks `172.16.10.10/32` y `172.16.20.20/32`.
- **Enlaces PE-CE**: `192.168.15.0/24`, `172.16.15.0/24`, `192.168.26.0/24` y `172.16.26.0/24`.

# Requerimientos

- Habilitar el backbone MPLS con LDP.
- Comprobar conectividad en el backbone a nivel IP y de etiquetas.
- Asignar un rango de etiquetas por router: P1 `100-199`, P2 `200-299`, P3 `300-399`, P4 `400-499`, PE5 `500-599` y PE6 `600-699`.
- Implementar VRFs para que los clientes no compartan su RIB, pero puedan alcanzar su otra sucursal a través de la red MPLS. Usar RD asociado a los AS de BGP.
- Implementar MP-BGP con la función VPNv4.
- Formar las vecindades requeridas; las loopbacks de los clientes son las LAN y deben participar en BGP.
- Comprobar que BGP reconozca las loopbacks a través del backbone MPLS.
- Verificar el etiquetado simple y doble en la VPN L3.
- Comprobar que cada cliente llegue a su sucursal a través de la red MPLS.

# Contexto previo

Este laboratorio **no comienza de cero**: las IPs de las interfaces y OSPF ya están configurados en el backbone. El trabajo se concentra en MPLS, VRF y MP-BGP.

# Desarrollo

## 1. Backbone MPLS con LDP

MPLS reenvía paquetes usando etiquetas en lugar de la dirección IP de destino. Para que eso funcione hacen falta tres piezas:

- **CEF** habilitado: es el plano de reenvío que MPLS utiliza. En IOS moderno viene activo por defecto, pero se declara de forma explícita.
- **`mpls ip`**: habilita MPLS de forma global.
- **LDP**: el protocolo que intercambia etiquetas entre vecinos. Se fija su router-id a la loopback 0, que es estable y siempre alcanzable por OSPF.

### Configuración manual

Primero se habilita MPLS en PE5 y se activa en la interfaz que lo conecta con P1.

<img src="/images/Pasted image 20251122204013.png" style="width:100%; height:auto; display:block; margin:auto;">

**PE5**

```bash
en
conf t
ip cef
mpls ip
mpls ldp router-id loopback0
```

<img src="/images/Pasted image 20251122204133.png" style="width:100%; height:auto; display:block; margin:auto;">

**PE5 — interfaz hacia el core**

```bash
int e0/2
mpls ip
ex
```

El mismo proceso se repite en P1.

**P1**

```bash
en
conf t
ip cef
mpls ip
mpls ldp router-id loopback0
int e0/2
mpls ip
ex
```

Cuando ambos extremos tienen MPLS habilitado y LDP puede alcanzarse, se forma la vecindad y aparece un mensaje de adyacencia en la consola.

<img src="/images/Pasted image 20251122204426.png" style="width:100%; height:auto; display:block; margin:auto;">

### Configuración automática con `mpls ldp autoconfig`

Habilitar MPLS interfaz por interfaz es tedioso en un backbone grande. Si todos los routers corren el mismo IGP, `mpls ldp autoconfig` dentro de OSPF activa MPLS en todas las interfaces que participan del protocolo.

**PE5**

```bash
router ospf 1
mpls ldp autoconfig
ex
mpls ldp router-id loopback0
```

El bloque completo para el resto de los routers del core queda así:

**P1**

```bash
en
conf t
ip cef
mpls ip
mpls ldp router-id loopback0
router ospf 1
mpls ldp autoconfig
ex
```

**P2**

```bash
en
conf t
ip cef
mpls ip
mpls ldp router-id loopback0
router ospf 1
mpls ldp autoconfig
ex
```

**P3**

```bash
en
conf t
ip cef
mpls ip
mpls ldp router-id loopback0
router ospf 1
mpls ldp autoconfig
ex
```

**P4**

```bash
en
conf t
ip cef
mpls ip
mpls ldp router-id loopback0
router ospf 1
mpls ldp autoconfig
ex
```

**PE6**

```bash
en
conf t
ip cef
mpls ip
mpls ldp router-id loopback0
router ospf 1
mpls ldp autoconfig
ex
```

Para comprobar que el path MPLS funciona se puede usar:

```bash
traceroute 5.5.5.5 numeric
```

## 2. Costos OSPF para elegir el path

En el core hay varios caminos posibles entre PE5 y PE6. Si dos rutas tienen el mismo costo, OSPF instala ambas y el tráfico se reparte. Para forzar un path se sube el costo de la interfaz que no se quiere preferir.

En PE6, `show ip route` muestra las rutas aprendidas por OSPF hacia el mismo destino:

<img src="/images/Pasted image 20251122210722.png" style="width:100%; height:auto; display:block; margin:auto;">

<img src="/images/Pasted image 20251122210823.png" style="width:100%; height:auto; display:block; margin:auto;">

Se agrega costo 888 al enlace `10.10.13.0/24` entre P1 y P3, en ambos extremos:

**P1**

```bash
int e0/1
ip ospf cost 888
ex
end
clear ip ospf process
```

**P3**

```bash
int e0/1
ip ospf cost 888
ex
end
clear ip ospf process
```

Después del cambio, PE6 debe ver una sola ruta hacia el destino:

<img src="/images/Pasted image 20251122211145.png" style="width:100%; height:auto; display:block; margin:auto;">

## 3. Rango de etiquetas por router

Cada router MPLS asigna etiquetas locales a los prefijos que anuncia. Para facilitar la lectura de la tabla de reenvío se reserva un rango distinto por equipo.

Primero se consulta el rango actual con:

```bash
show mpls forwarding-table
```

<img src="/images/Pasted image 20251122211344.png" style="width:100%; height:auto; display:block; margin:auto;">

Luego se ajusta el rango en cada router:

**P1**

```bash
en
conf t
mpls label range 100 199
```

**P2**

```bash
en
conf t
mpls label range 200 299
```

**P3**

```bash
en
conf t
mpls label range 300 399
```

**P4**

```bash
en
conf t
mpls label range 400 499
```

**PE5**

```bash
en
conf t
mpls label range 500 599
```

**PE6**

```bash
en
conf t
mpls label range 600 699
```

## 4. VRF y route-targets

Una **VRF** es una tabla de enrutamiento independiente. Permite que dos clientes usen el mismo espacio de direcciones sin mezclarse. En MPLS L3VPN se usan tres conceptos:

- **VRF**: la tabla virtual del cliente en el PE.
- **RD (Route Distinguisher)**: prefijo que hace única una ruta dentro de MP-BGP. Se asocia al AS del cliente y a la sucursal.
- **Route-target (RT)**: controla qué rutas se exportan e importan entre VRFs. El `export` de una sucursal debe coincidir con el `import` de la otra.

<img src="/images/Pasted image 20251122225711.png" style="width:100%; height:auto; display:block; margin:auto;">

> **Nota:** `ip vrf [nombre]` es la forma heredada, solo IPv4. `vrf definition [nombre]` es la forma moderna y permite IPv6. En este laboratorio se usa `ip vrf` porque el direccionamiento es IPv4.

**PE5 — Cliente A**

```bash
en
conf t
ip vrf CLIENTE-A
rd 65200:1
route-target export 65200:1
route-target import 65300:2
ex
```

**PE5 — Cliente B**

```bash
en
conf t
ip vrf CLIENTE-B
rd 65200:1
route-target export 65400:1
route-target import 65400:2
ex
```

> El RD debe ser único por VRF. En los apuntes, `CLIENTE-B` quedó con el mismo RD que `CLIENTE-A` (`65200:1`). Si tu plataforma lo rechaza o las rutas se mezclan, usa un RD distinto, por ejemplo `65200:2`.

**PE6 — Cliente A**

```bash
en
conf t
ip vrf CLIENTE-A
rd 65300:2
route-target export 65300:2
route-target import 65200:1
ex
```

**PE6 — Cliente B**

```bash
en
conf t
ip vrf CLIENTE-B
rd 65400:2
route-target export 65400:2
route-target import 65400:1
ex
```

<img src="/images/Pasted image 20251122230041.png" style="width:100%; height:auto; display:block; margin:auto;">

## 5. Asignación de VRF a las interfaces

Cada interfaz del PE que conecta a un cliente se asocia a su VRF. Al hacerlo, la interfaz deja de usar la tabla global y pasa a la tabla del cliente.

**PE5**

```bash
en
conf t
int e0/0
ip vrf forwarding CLIENTE-A
ip add 192.168.15.5 255.255.255.0
no shut
ex
int e0/1
ip vrf forwarding CLIENTE-B
ip add 172.16.15.5 255.255.255.0
no shut
ex
```

**PE6**

```bash
en
conf t
int e0/2
ip vrf forwarding CLIENTE-A
ip add 192.168.20.6 255.255.255.0
no shut
ex
int e0/3
ip vrf forwarding CLIENTE-B
ip add 172.16.26.6 255.255.255.0
no shut
ex
```

Para probar la conectividad dentro de una VRF se usa `ping vrf`, porque la tabla global no conoce esas redes:

```bash
ping vrf CLIENTE-A 192.168.15.1
```

## 6. iBGP en el backbone

PE5 y PE6 forman una sesión iBGP dentro del AS 65100 usando sus loopbacks como origen. Esta sesión transporta las rutas VPNv4 de los clientes.

<img src="/images/Pasted image 20251122231240.png" style="width:100%; height:auto; display:block; margin:auto;">

**PE5**

```bash
en
conf t
router bgp 65100
router-id 5.5.5.5
neighbor 6.6.6.6 remote-as 65100
neighbor 6.6.6.6 update-source loopback 0
ex
```

**PE6**

```bash
en
conf t
router bgp 65100
router-id 6.6.6.6
neighbor 5.5.5.5 remote-as 65100
neighbor 5.5.5.5 update-source loopback 0
ex
```

## 7. Address-family VPNv4

La sesión iBGP anterior todavía no transporta rutas VPN. Hay que activar la address-family VPNv4 en cada vecino. Al hacerlo, IOS agrega automáticamente `send-community extended`, necesario para propagar los route-targets.

**PE5**

```bash
en
conf t
router bgp 65100
address-family vpnv4 unicast
neighbor 6.6.6.6 activate
ex
ex
```

**PE6**

```bash
en
conf t
router bgp 65100
address-family vpnv4 unicast
neighbor 5.5.5.5 activate
ex
ex
```

Al revisar `show run`, debe aparecer `neighbor 5.5.5.5 send-community extended`:

<img src="/images/Pasted image 20251122231828.png" style="width:100%; height:auto; display:block; margin:auto;">

## 8. BGP con los clientes (CE)

Cada PE forma eBGP con los routers de cliente dentro de la VRF correspondiente. Para eso se usa `address-family ipv4 vrf [nombre]`, no la configuración global de BGP.

<img src="/images/Pasted image 20251123001133.png" style="width:100%; height:auto; display:block; margin:auto;">

**PE5**

```bash
en
conf t
router bgp 65100
address-family ipv4 vrf CLIENTE-A
neighbor 192.168.15.1 remote-as 65200
ex
address-family ipv4 vrf CLIENTE-B
neighbor 172.16.15.1 remote-as 65400
ex
ex
```

**PE6**

```bash
en
conf t
router bgp 65100
address-family ipv4 vrf CLIENTE-A
neighbor 192.168.26.2 remote-as 65300
ex
address-family ipv4 vrf CLIENTE-B
neighbor 172.16.26.2 remote-as 65400
ex
ex
```

Los routers de cliente se configuran de la forma habitual, sin VRF, y anuncian su loopback:

**CLIENTE_A1**

```bash
en
conf t
router bgp 65200
neighbor 192.168.15.5 remote-as 65100
network 192.168.10.10 mask 255.255.255.255
ex
```

**CLIENTE_B1**

```bash
en
conf t
router bgp 65400
neighbor 172.16.15.5 remote-as 65100
network 172.16.10.10 mask 255.255.255.255
ex
```

**CLIENTE_A2**

```bash
en
conf t
router bgp 65300
neighbor 192.168.26.6 remote-as 65100
network 192.168.20.20 mask 255.255.255.255
ex
```

**CLIENTE_B2**

```bash
en
conf t
router bgp 65400
neighbor 172.16.26.6 remote-as 65100
network 172.16.20.20 mask 255.255.255.255
ex
```

<img src="/images/Pasted image 20251123002941.png" style="width:100%; height:auto; display:block; margin:auto;">

Para verificar en los PE:

```bash
show ip bgp vpnv4 all
```

Este comando muestra las rutas de los clientes con su RD, su route-target y el next-hop dentro del backbone.

## 9. allowas-in: repetición de AS

BGP usa el atributo `AS_PATH` para prevenir bucles: si un router ve su propio AS en el path, descarta la ruta. En este laboratorio, `CLIENTE_B1` y `CLIENTE_B2` comparten el AS 65400 y entre ellos está el AS 65100 del proveedor. El path que ve un CE es `65400 → 65100 → 65400`, por lo que detecta su propio AS y rechaza la ruta.

La solución es permitir esa repetición con `allowas-in` en los CE:

<img src="/images/Pasted image 20251123005043.png" style="width:100%; height:auto; display:block; margin:auto;">

**CLIENTE_B1**

```bash
router bgp 65400
neighbor 172.16.15.5 allowas-in
ex
```

<img src="/images/Pasted image 20251123005119.png" style="width:100%; height:auto; display:block; margin:auto;">

**CLIENTE_B2**

```bash
router bgp 65400
neighbor 172.16.26.6 allowas-in
ex
```

## Verificación

- **MPLS / LDP**
  - `show mpls ldp neighbor` (vecindades `Oper`).
  - `show mpls forwarding-table` (etiquetas locales y remotas).
  - `traceroute 5.5.5.5 numeric` (el path debe atravesar el core con etiquetas).
- **VRF**
  - `show ip vrf`
  - `show ip route vrf CLIENTE-A`
  - `show ip route vrf CLIENTE-B`
  - `ping vrf CLIENTE-A 192.168.15.1`
- **BGP**
  - `show ip bgp summary`
  - `show ip bgp vpnv4 all` (RD, RT y next-hop de cada prefijo).
  - `show ip bgp vpnv4 vrf CLIENTE-A`
- **Conectividad extremo a extremo**
  - `ping` entre `CLIENTE_A1` y `CLIENTE_A2`.
  - `ping` entre `CLIENTE_B1` y `CLIENTE_B2`.
  - `traceroute` para confirmar el doble etiquetado en el core.

# Conclusión

El laboratorio recorre un servicio MPLS L3VPN completo: backbone con LDP y etiquetas, selección de path con OSPF, VRFs con RD/RT, MP-BGP VPNv4 y sesiones eBGP con los clientes.

Los puntos críticos al reproducirlo son: que LDP tenga vecindad en todos los enlaces del core, que el RD sea único por VRF, que los route-targets de export/import coincidan entre las dos sucursales del mismo cliente, que la address-family VPNv4 esté activada en los PE, y que los CE con AS repetido usen `allowas-in`.
