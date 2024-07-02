create temp table events as
select t::timestamp as t, * from read_json_auto('./out/events.jsonl');

select e, s, count(*)
from events
group by e, s
order by count(*) desc
;

select
    min(n)::decimal(8, 1) as min,
    max(n)::decimal(8, 1) as min,
    avg(n)::decimal(8, 1) as avg,
    stddev_samp(n)::decimal(8, 1) as stddev,
from events
where e = 'Time' and s = 'eth_sendRawTransaction'
;


select
    newblock.blocknumber as block_number,
    newblock.t as rpc_time,
    blockdata.blocktimestamp as block_time,
    sendtx.n as broadcast_duration
from events newblock, events blockdata, events sendtx
where
    newblock.e = 'NewBlock'
    and blockdata.e = 'NewBlockData'
    and newblock.blocknumber = blockdata.blocknumber

    and sendtx.e = 'Time'
    and sendtx.s = 'eth_sendRawTransaction'
    and list_contains(blockdata.blocktransactions, sendtx.txhash)

