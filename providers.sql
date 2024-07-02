create temp table events as
select t::timestamp as t, blocktimestamp::timestamp as blocktimestamp, * from read_json_auto('./out/events.jsonl');

select o, e, s, count(*)
from events
group by e, s, o
order by count(*) desc
;

create temp table times as
select
    newblock.o as origin,
    newblock.blocknumber as block_number,
    newblock.t as rpc_time,
    blockdata.blocktimestamp as block_time,
    sendtx.n as broadcast_duration,
    sendtx.t as broadcast_time,
from events newblock, events blockdata, events sendtx
where
    newblock.e = 'NewBlock'
    and blockdata.e = 'NewBlockData'
    and newblock.blocknumber = blockdata.blocknumber

    and sendtx.e = 'Time'
    and sendtx.s = 'eth_sendRawTransaction'
    and list_contains(blockdata.blocktransactions, sendtx.txhash);

select distinct
    origin as 'provider',

    (
        select avg(extract(ms from (t.block_time - t.broadcast_time)))::int || ' ms'
        from times as t
        where t.origin = rt.origin
    ) as 'send>block_ts',

    (
        select avg(extract(ms from (t.rpc_time - t.block_time)))::int || ' ms'
        from times as t
        where t.origin = rt.origin
    ) as 'block_ts>rpc',

    (
        select
            avg(extract(ms from (t.rpc_time - t.broadcast_time)))::int
            || ' ± '
            || stddev((extract(ms from (t.rpc_time - t.broadcast_time))))::int
            || ' ms'
        from times as t
        where t.origin = rt.origin
    ) as 'total (submit>rpc)',
from times rt
;

