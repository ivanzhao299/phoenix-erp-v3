--
-- PostgreSQL database dump
--

\restrict CyeVcTlLCQM53g9eRiArVe5ojMPHeh2yIPTsDh7TWG3TT7gOYRMIvq2NrR1gMNk

-- Dumped from database version 18.3 (Postgres.app)
-- Dumped by pg_dump version 18.3 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'G5.5-C: 主数据完成度从 54.5 提升至 85+';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: fn_bump_user_perms_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_bump_user_perms_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- 批量迁移模式：跳过 perms_version 递增（防止批量操作踢出所有在线用户）
    IF current_setting('phx.skip_perms_bump', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- sys_user_role 变更：bump 对应 user
    IF TG_TABLE_NAME = 'sys_user_role' THEN
        IF TG_OP = 'DELETE' THEN
            UPDATE sys_user SET perms_version = perms_version + 1 WHERE user_id = OLD.user_id;
        ELSE
            UPDATE sys_user SET perms_version = perms_version + 1 WHERE user_id = NEW.user_id;
        END IF;
    -- sys_user_permission_set 变更：bump 对应 user
    ELSIF TG_TABLE_NAME = 'sys_user_permission_set' THEN
        IF TG_OP = 'DELETE' THEN
            UPDATE sys_user SET perms_version = perms_version + 1 WHERE user_id = OLD.user_id;
        ELSE
            UPDATE sys_user SET perms_version = perms_version + 1 WHERE user_id = NEW.user_id;
        END IF;
    -- sys_role_menu_permission 变更：bump 所有 hold 该 role 的 user
    ELSIF TG_TABLE_NAME = 'sys_role_menu_permission' THEN
        IF TG_OP = 'DELETE' THEN
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (SELECT user_id FROM sys_user_role WHERE role_id = OLD.role_id);
        ELSE
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (SELECT user_id FROM sys_user_role WHERE role_id = NEW.role_id);
        END IF;
    -- sys_role_permission_set / sys_permission_set_item 变更：bump 关联角色的所有用户
    ELSIF TG_TABLE_NAME = 'sys_role_permission_set' THEN
        IF TG_OP = 'DELETE' THEN
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (SELECT user_id FROM sys_user_role WHERE role_id = OLD.role_id);
        ELSE
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (SELECT user_id FROM sys_user_role WHERE role_id = NEW.role_id);
        END IF;
    ELSIF TG_TABLE_NAME = 'sys_permission_set_item' THEN
        IF TG_OP = 'DELETE' THEN
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (
                SELECT DISTINCT ur.user_id FROM sys_user_role ur
                JOIN sys_role_permission_set rps ON rps.role_id = ur.role_id
                WHERE rps.set_id = OLD.set_id
                UNION
                SELECT user_id FROM sys_user_permission_set WHERE set_id = OLD.set_id
            );
        ELSE
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (
                SELECT DISTINCT ur.user_id FROM sys_user_role ur
                JOIN sys_role_permission_set rps ON rps.role_id = ur.role_id
                WHERE rps.set_id = NEW.set_id
                UNION
                SELECT user_id FROM sys_user_permission_set WHERE set_id = NEW.set_id
            );
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: inv_batches_sync_available(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inv_batches_sync_available() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
         BEGIN
           IF NEW.qty_available IS NULL THEN NEW.qty_available := NEW.qty; END IF;
           RETURN NEW;
         END;
         $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: acc_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_ledger (
    id integer NOT NULL,
    store_code character varying(64),
    ref_no character varying(64),
    ledger_type character varying(32),
    amount numeric(18,2) DEFAULT 0,
    balance_after numeric(18,2) DEFAULT 0,
    note text,
    created_at text
);


--
-- Name: acc_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.acc_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: acc_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.acc_ledger_id_seq OWNED BY public.acc_ledger.id;


--
-- Name: b2b_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.b2b_customers (
    id bigint NOT NULL,
    customer_name character varying(128),
    created_at timestamp without time zone DEFAULT now(),
    area_code character varying(32),
    contact_name character varying(64),
    contact_phone character varying(32),
    tax_no character varying(64),
    credit_days integer DEFAULT 30,
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    address text,
    contact character varying(100),
    credit_limit numeric(12,2) DEFAULT 0,
    customer_code character varying(50),
    phone character varying(30),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE b2b_customers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.b2b_customers IS '[LEGACY][READ_ONLY][Phase E封存] 禁止新业务写入 — 正式主档见 sal_customers (DISTRIBUTOR type)';


--
-- Name: b2b_customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.b2b_customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: b2b_customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.b2b_customers_id_seq OWNED BY public.b2b_customers.id;


--
-- Name: b2b_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.b2b_order_items (
    id integer NOT NULL,
    order_no character varying(50),
    product_code character varying(50),
    qty numeric(12,3) DEFAULT 0,
    unit_price numeric(10,4) DEFAULT 0,
    amount numeric(12,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: b2b_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.b2b_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: b2b_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.b2b_order_items_id_seq OWNED BY public.b2b_order_items.id;


--
-- Name: b2b_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.b2b_orders (
    id integer NOT NULL,
    order_no character varying(50),
    customer_code character varying(50),
    customer_name character varying(100),
    order_date date,
    total_amount numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: b2b_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.b2b_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: b2b_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.b2b_orders_id_seq OWNED BY public.b2b_orders.id;


--
-- Name: biz_cash_flow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.biz_cash_flow (
    id bigint NOT NULL,
    store_code character varying(32) DEFAULT 'ALL'::character varying NOT NULL,
    flow_type character varying(32) NOT NULL,
    category character varying(64) NOT NULL,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    currency_code character varying(8) NOT NULL,
    payer character varying(128),
    payee character varying(128),
    remark text,
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    ref_doc_id bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: biz_cash_flow_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.biz_cash_flow_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: biz_cash_flow_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.biz_cash_flow_id_seq OWNED BY public.biz_cash_flow.id;


--
-- Name: biz_purchase_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.biz_purchase_order (
    id bigint NOT NULL,
    po_no character varying(64) NOT NULL,
    supplier_code character varying(128) NOT NULL,
    total_amount numeric(18,2) DEFAULT 0,
    currency_code character varying(8) DEFAULT 'CNY'::character varying,
    status character varying(32) DEFAULT 'DRAFT'::character varying,
    plan_qty integer DEFAULT 0,
    received_qty integer DEFAULT 0,
    store_code character varying(32) DEFAULT 'ALL'::character varying,
    created_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: biz_purchase_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.biz_purchase_order_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: biz_purchase_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.biz_purchase_order_id_seq OWNED BY public.biz_purchase_order.id;


--
-- Name: biz_sales_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.biz_sales_order (
    order_id bigint NOT NULL,
    order_no character varying(64) NOT NULL,
    customer_id bigint NOT NULL,
    total_amount numeric(18,2) NOT NULL,
    currency_code character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    store_code character varying(64) NOT NULL,
    created_store_code character varying(64) NOT NULL,
    created_by bigint NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by bigint,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    deleted_at timestamp without time zone,
    note text
);


--
-- Name: biz_sales_order_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.biz_sales_order_order_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: biz_sales_order_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.biz_sales_order_order_id_seq OWNED BY public.biz_sales_order.order_id;


--
-- Name: brd_daily_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brd_daily_logs (
    id integer NOT NULL,
    log_no character varying(64),
    log_date date NOT NULL,
    house_code character varying(64),
    flock_no character varying(64),
    shift character varying(20) DEFAULT ''::character varying,
    eggs_produced integer DEFAULT 0,
    good_eggs integer DEFAULT 0,
    broken_eggs integer DEFAULT 0,
    mortality_qty integer DEFAULT 0,
    feed_qty numeric(18,2) DEFAULT 0,
    water_qty numeric(18,2) DEFAULT 0,
    temperature numeric(5,2),
    humidity numeric(5,2),
    operator character varying(64),
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    farm_code character varying(64),
    farm_name character varying(256),
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    bad_eggs integer DEFAULT 0,
    dirty_eggs integer DEFAULT 0,
    egg_count integer DEFAULT 0,
    feed_consumed numeric(10,2) DEFAULT 0,
    temp numeric(5,2),
    water_consumed numeric(10,2) DEFAULT 0,
    elimination_qty integer DEFAULT 0,
    culling_reason character varying(200),
    opening_qty integer DEFAULT 0,
    closing_qty integer DEFAULT 0,
    self_use_qty integer DEFAULT 0,
    lay_rate numeric(5,4)
);


--
-- Name: COLUMN brd_daily_logs.opening_qty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.brd_daily_logs.opening_qty IS '期初存栏（开盘数量，源自 Excel 生产日报"期初存栏"列）';


--
-- Name: COLUMN brd_daily_logs.closing_qty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.brd_daily_logs.closing_qty IS '期末存栏（收盘数量；= opening_qty − mortality_qty − elimination_qty − self_use_qty）';


--
-- Name: COLUMN brd_daily_logs.self_use_qty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.brd_daily_logs.self_use_qty IS '当日自用数量（场内消化，源自 Excel 生产日报"自用"列）';


--
-- Name: COLUMN brd_daily_logs.lay_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.brd_daily_logs.lay_rate IS '产蛋率（0.0000 ~ 1.0000；可手填或由 eggs_produced / closing_qty 派生）';


--
-- Name: brd_daily_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brd_daily_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brd_daily_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brd_daily_logs_id_seq OWNED BY public.brd_daily_logs.id;


--
-- Name: brd_farms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brd_farms (
    farm_code character varying(50) NOT NULL,
    farm_name character varying(100),
    location character varying(200),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    houses integer DEFAULT 0,
    capacity integer DEFAULT 0,
    updated_at timestamp without time zone,
    store_code character varying(64) DEFAULT 'ALL'::character varying
);


--
-- Name: brd_flocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brd_flocks (
    flock_no character varying(50) NOT NULL,
    house_code character varying(50),
    farm_code character varying(50),
    strain character varying(50),
    placement_date date,
    placement_age integer,
    initial_qty integer,
    current_qty integer,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    start_date date,
    current_lay_rate numeric(5,2),
    updated_at timestamp without time zone,
    breed_type character varying(50),
    source_farm character varying(100),
    cost numeric(10,2) DEFAULT 0,
    target_weeks integer DEFAULT 80,
    elimination_date date,
    peak_lay_rate numeric(5,2),
    feed_conversion_ratio numeric(5,3),
    batch_no character varying(50),
    store_code character varying(64) DEFAULT 'ALL'::character varying
);


--
-- Name: brd_houses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brd_houses (
    house_code character varying(50) NOT NULL,
    house_name character varying(100),
    farm_code character varying(50),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    farm_name character varying(100),
    house_type character varying(50),
    capacity integer DEFAULT 0,
    current_birds integer DEFAULT 0,
    updated_at timestamp without time zone,
    store_code character varying(64) DEFAULT 'ALL'::character varying
);


--
-- Name: brd_immune_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brd_immune_plans (
    id integer NOT NULL,
    plan_no character varying(50),
    flock_no character varying(50),
    house_code character varying(50),
    vaccine character varying(100),
    plan_date date,
    actual_date date,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: brd_immune_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brd_immune_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brd_immune_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brd_immune_plans_id_seq OWNED BY public.brd_immune_plans.id;


--
-- Name: brd_medication_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brd_medication_records (
    id integer NOT NULL,
    flock_no character varying(50),
    drug_name character varying(100),
    start_date date,
    end_date date,
    dosage character varying(100),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    batch_no character varying(64),
    medication_code character varying(64),
    house_code character varying(64),
    farm_code character varying(64),
    site_code character varying(64),
    company_code character varying(64),
    disease character varying(255),
    days_used integer DEFAULT 5,
    withdraw_days integer DEFAULT 7,
    clear_date date,
    dose character varying(255),
    usage_route character varying(64),
    executor character varying(64),
    remark text,
    attachment_url text,
    store_code character varying(64)
);


--
-- Name: TABLE brd_medication_records; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.brd_medication_records IS 'G21-4：用药业务记录表（区别于 brd_medications 主档）';


--
-- Name: brd_medication_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brd_medication_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brd_medication_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brd_medication_records_id_seq OWNED BY public.brd_medication_records.id;


--
-- Name: brd_medications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brd_medications (
    id integer NOT NULL,
    med_no character varying(64),
    flock_no character varying(64),
    med_name character varying(128),
    dosage character varying(64),
    start_date date,
    end_date date,
    withdrawal_days integer DEFAULT 0,
    operator character varying(64),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    medication_code character varying(64),
    medication_name character varying(256),
    status character varying(32) DEFAULT 'ACTIVE'::character varying,
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: brd_medications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brd_medications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brd_medications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brd_medications_id_seq OWNED BY public.brd_medications.id;


--
-- Name: brd_vaccinations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brd_vaccinations (
    id integer NOT NULL,
    flock_no character varying(50),
    vaccine character varying(100),
    plan_date date,
    actual_date date,
    batch_no character varying(50),
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    farm_house character varying(100),
    house_code character varying(50),
    farm_code character varying(50),
    vaccine_name character varying(100),
    vaccine_batch_no character varying(50),
    flock_count integer DEFAULT 0,
    next_due_date date,
    method character varying(50),
    dose character varying(100),
    executor character varying(100)
);


--
-- Name: brd_vaccinations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brd_vaccinations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brd_vaccinations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brd_vaccinations_id_seq OWNED BY public.brd_vaccinations.id;


--
-- Name: brd_withdrawal_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brd_withdrawal_alerts (
    id integer NOT NULL,
    flock_no character varying(50),
    drug_name character varying(100),
    end_date date,
    days_left integer DEFAULT 0,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: brd_withdrawal_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brd_withdrawal_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brd_withdrawal_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brd_withdrawal_alerts_id_seq OWNED BY public.brd_withdrawal_alerts.id;


--
-- Name: chn_distributor_grading; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chn_distributor_grading (
    id integer NOT NULL,
    customer_name character varying(100),
    customer_code character varying(50),
    grade character varying(20) DEFAULT 'B'::character varying,
    credit_limit numeric(12,2) DEFAULT 0,
    region character varying(100),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chn_distributor_grading_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chn_distributor_grading_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chn_distributor_grading_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chn_distributor_grading_id_seq OWNED BY public.chn_distributor_grading.id;


--
-- Name: crm_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_activities (
    id integer NOT NULL,
    name character varying(100),
    type character varying(50),
    start_date date,
    end_date date,
    budget numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: crm_activities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_activities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_activities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_activities_id_seq OWNED BY public.crm_activities.id;


--
-- Name: crm_coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_coupons (
    id integer NOT NULL,
    coupon_code character varying(50),
    name character varying(100),
    type character varying(30),
    value numeric(10,2) DEFAULT 0,
    min_order numeric(10,2) DEFAULT 0,
    expire_date date,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: crm_coupons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_coupons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_coupons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_coupons_id_seq OWNED BY public.crm_coupons.id;


--
-- Name: crm_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_levels (
    id integer NOT NULL,
    level_name character varying(50),
    min_points integer DEFAULT 0,
    discount_rate numeric(4,2) DEFAULT 1.00,
    benefits text,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: crm_levels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_levels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_levels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_levels_id_seq OWNED BY public.crm_levels.id;


--
-- Name: crm_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_members (
    id integer NOT NULL,
    member_id character varying(50),
    name character varying(100),
    phone character varying(30),
    level character varying(30) DEFAULT '普通会员'::character varying,
    points integer DEFAULT 0,
    store_code character varying(50),
    registered_date date,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: crm_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_members_id_seq OWNED BY public.crm_members.id;


--
-- Name: crm_points_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_points_ledger (
    id integer NOT NULL,
    member_id character varying(50) NOT NULL,
    period character varying(20),
    balance integer DEFAULT 0,
    earned integer DEFAULT 0,
    used integer DEFAULT 0,
    expired integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: crm_points_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_points_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_points_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_points_ledger_id_seq OWNED BY public.crm_points_ledger.id;


--
-- Name: crm_points_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_points_log (
    id integer NOT NULL,
    member_id character varying(50),
    points integer DEFAULT 0,
    type character varying(30),
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: crm_points_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_points_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_points_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_points_log_id_seq OWNED BY public.crm_points_log.id;


--
-- Name: crm_points_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_points_rules (
    id integer NOT NULL,
    rule_name character varying(100),
    condition_type character varying(50),
    points_value integer DEFAULT 0,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: crm_points_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_points_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_points_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_points_rules_id_seq OWNED BY public.crm_points_rules.id;


--
-- Name: cst_credit_warnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cst_credit_warnings (
    id integer NOT NULL,
    customer_code character varying(64),
    warning_type character varying(32),
    threshold numeric(18,2),
    current_value numeric(18,2),
    status character varying(20) DEFAULT 'OPEN'::character varying,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    credit_limit numeric(18,2) DEFAULT 0,
    current_balance numeric(18,2) DEFAULT 0,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    warning_threshold numeric(5,2) DEFAULT 0
);


--
-- Name: cst_credit_warnings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cst_credit_warnings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cst_credit_warnings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cst_credit_warnings_id_seq OWNED BY public.cst_credit_warnings.id;


--
-- Name: daily_close; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_close (
    id integer NOT NULL,
    close_no character varying(64) NOT NULL,
    store_code character varying(64) NOT NULL,
    close_date date NOT NULL,
    operator character varying(64),
    total_sales numeric(18,2) DEFAULT 0,
    total_transactions integer DEFAULT 0,
    cash_sales numeric(18,2) DEFAULT 0,
    qr_sales numeric(18,2) DEFAULT 0,
    card_sales numeric(18,2) DEFAULT 0,
    discount_total numeric(18,2) DEFAULT 0,
    cash_actual numeric(18,2) DEFAULT 0,
    cash_diff numeric(18,2) DEFAULT 0,
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    note text,
    submitted_at text,
    created_at text
);


--
-- Name: daily_close_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_close_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_close_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_close_id_seq OWNED BY public.daily_close.id;


--
-- Name: data_quality_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_quality_alerts (
    id bigint NOT NULL,
    source character varying(32) NOT NULL,
    alert_type character varying(64) NOT NULL,
    severity character varying(16) NOT NULL,
    affected_count integer DEFAULT 0 NOT NULL,
    message text NOT NULL,
    recommendation text,
    payload jsonb,
    status character varying(16) DEFAULT 'OPEN'::character varying NOT NULL,
    acked_by character varying(64),
    acked_at timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE data_quality_alerts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.data_quality_alerts IS 'G5: 数据质量告警持久化记录。每日由调度任务调用 DataQualityAggregatorService 写入；
   也可由 alerts 端点实时计算生成（不持久化）。';


--
-- Name: data_quality_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.data_quality_alerts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_quality_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.data_quality_alerts_id_seq OWNED BY public.data_quality_alerts.id;


--
-- Name: data_quality_score_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_quality_score_snapshots (
    id bigint NOT NULL,
    overall integer NOT NULL,
    master_data integer NOT NULL,
    dict integer NOT NULL,
    datascope integer NOT NULL,
    traceability integer NOT NULL,
    inventory integer NOT NULL,
    workflow integer NOT NULL,
    code integer NOT NULL,
    alert_count integer DEFAULT 0 NOT NULL,
    high_alert_count integer DEFAULT 0 NOT NULL,
    snapshot_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE data_quality_score_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.data_quality_score_snapshots IS 'G5: 数据质量评分历史快照（每日 / 每小时由调度任务写入），用于驾驶舱趋势图';


--
-- Name: data_quality_score_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.data_quality_score_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_quality_score_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.data_quality_score_snapshots_id_seq OWNED BY public.data_quality_score_snapshots.id;


--
-- Name: fin_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_accounts (
    id integer NOT NULL,
    account_code character varying(64) NOT NULL,
    account_name character varying(128),
    account_type character varying(32),
    currency_code character varying(8) DEFAULT 'LAK'::character varying,
    balance numeric(18,2) DEFAULT 0,
    status character varying(16) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    currency character varying(8) DEFAULT 'CNY'::character varying,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: fin_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_accounts_id_seq OWNED BY public.fin_accounts.id;


--
-- Name: fin_ap_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_ap_invoices (
    id bigint NOT NULL,
    ap_no character varying(60) NOT NULL,
    source_type character varying(30) DEFAULT 'MANUAL'::character varying NOT NULL,
    source_id bigint,
    source_no character varying(80),
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    project_code character varying(64),
    project_name character varying(256),
    supplier_id bigint,
    supplier_code character varying(64),
    supplier_name character varying(256) NOT NULL,
    invoice_no character varying(100),
    invoice_date date,
    due_date date,
    currency_code character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    base_currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    paid_amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    paid_amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    balance_amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    balance_amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    status character varying(32) DEFAULT 'OPEN'::character varying NOT NULL,
    payment_status character varying(20) DEFAULT 'UNPAID'::character varying NOT NULL,
    tax_amount numeric(18,2),
    tax_rate numeric(8,4),
    wf_instance_id bigint,
    remark text,
    created_by character varying(80),
    updated_by character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fin_ap_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_ap_invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_ap_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_ap_invoices_id_seq OWNED BY public.fin_ap_invoices.id;


--
-- Name: fin_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_approvals (
    id integer NOT NULL,
    expense_no character varying(64),
    level integer,
    approver_id integer,
    status character varying(20),
    remark text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    action character varying(32),
    approver character varying(128),
    approver_role character varying(64),
    comment text,
    doc_id bigint,
    doc_type character varying(64),
    role character varying(64),
    txn_id character varying(64)
);


--
-- Name: fin_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_approvals_id_seq OWNED BY public.fin_approvals.id;


--
-- Name: fin_ar_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_ar_invoices (
    id bigint NOT NULL,
    ar_no character varying(60) NOT NULL,
    source_type character varying(30) DEFAULT 'MANUAL'::character varying NOT NULL,
    source_id bigint,
    source_no character varying(80),
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    project_code character varying(64),
    project_name character varying(256),
    customer_id bigint,
    customer_code character varying(64),
    customer_name character varying(256) NOT NULL,
    invoice_no character varying(100),
    invoice_date date,
    due_date date,
    currency_code character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    base_currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    received_amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    received_amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    balance_amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    balance_amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    status character varying(32) DEFAULT 'OPEN'::character varying NOT NULL,
    collection_status character varying(20) DEFAULT 'UNRECEIVED'::character varying NOT NULL,
    wf_instance_id bigint,
    remark text,
    created_by character varying(80),
    updated_by character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sal_customer_id bigint
);


--
-- Name: COLUMN fin_ar_invoices.sal_customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fin_ar_invoices.sal_customer_id IS 'Phase G1 — FK 逻辑 → sal_customers.id（不加硬 FK，允许历史空值）';


--
-- Name: fin_ar_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_ar_invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_ar_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_ar_invoices_id_seq OWNED BY public.fin_ar_invoices.id;


--
-- Name: fin_ar_receipt_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_ar_receipt_allocations (
    id bigint NOT NULL,
    receipt_id bigint NOT NULL,
    receipt_no character varying(60) NOT NULL,
    ar_invoice_id bigint NOT NULL,
    ar_no character varying(60) NOT NULL,
    allocated_amount_original numeric(18,2) NOT NULL,
    allocated_amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    currency_code character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_fin_alloc_positive CHECK ((allocated_amount_original > (0)::numeric))
);


--
-- Name: fin_ar_receipt_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_ar_receipt_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_ar_receipt_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_ar_receipt_allocations_id_seq OWNED BY public.fin_ar_receipt_allocations.id;


--
-- Name: fin_ar_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_ar_receipts (
    id bigint NOT NULL,
    receipt_no character varying(60) NOT NULL,
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    project_code character varying(64),
    project_name character varying(256),
    customer_id bigint,
    customer_code character varying(64),
    customer_name character varying(256) NOT NULL,
    receipt_date date NOT NULL,
    currency_code character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    amount_original numeric(18,2) NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    base_currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    receipt_method character varying(40),
    received_account_code character varying(100),
    bank_ref character varying(100),
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    wf_instance_id bigint,
    remark text,
    created_by character varying(80),
    updated_by character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sal_customer_id bigint
);


--
-- Name: COLUMN fin_ar_receipts.sal_customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fin_ar_receipts.sal_customer_id IS 'Phase G1 — FK 逻辑 → sal_customers.id（不加硬 FK，允许历史空值）';


--
-- Name: fin_ar_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_ar_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_ar_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_ar_receipts_id_seq OWNED BY public.fin_ar_receipts.id;


--
-- Name: fin_bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_bank_accounts (
    id bigint NOT NULL,
    bank_account_code character varying(64) NOT NULL,
    bank_name character varying(128) NOT NULL,
    bank_name_en character varying(128),
    branch_name character varying(128),
    account_no character varying(64) NOT NULL,
    account_holder character varying(128) NOT NULL,
    currency_code character varying(16) NOT NULL,
    country_code character varying(8) DEFAULT 'CN'::character varying,
    swift_code character varying(16),
    iban character varying(64),
    company_code character varying(64),
    status character varying(16) DEFAULT 'DRAFT'::character varying NOT NULL,
    effective_date date,
    expire_date date,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE fin_bank_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fin_bank_accounts IS 'G5.5-C: 银行账户中心（境外/跨境结算账户）— 与 fin_cash_accounts 通过 bank_acc_code 关联';


--
-- Name: fin_bank_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_bank_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_bank_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_bank_accounts_id_seq OWNED BY public.fin_bank_accounts.id;


--
-- Name: fin_cash_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_cash_accounts (
    id bigint NOT NULL,
    account_code character varying(60) NOT NULL,
    account_name character varying(200) NOT NULL,
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    currency_code character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    account_type character varying(30) DEFAULT 'BANK'::character varying NOT NULL,
    opening_balance numeric(18,2) DEFAULT 0 NOT NULL,
    current_balance numeric(18,2) DEFAULT 0 NOT NULL,
    bank_name character varying(100),
    bank_account_no character varying(60),
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    remark text,
    created_by character varying(80),
    updated_by character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bank_acc_code character varying(40),
    holder_code character varying(40),
    effective_date date,
    expire_date date
);


--
-- Name: fin_cash_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_cash_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_cash_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_cash_accounts_id_seq OWNED BY public.fin_cash_accounts.id;


--
-- Name: fin_cash_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_cash_transactions (
    id bigint NOT NULL,
    txn_no character varying(60) NOT NULL,
    account_id bigint NOT NULL,
    account_code character varying(60) NOT NULL,
    account_name character varying(200) NOT NULL,
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    direction character varying(8) NOT NULL,
    source_type character varying(30),
    source_id bigint,
    source_no character varying(80),
    currency_code character varying(8) NOT NULL,
    amount numeric(18,2) NOT NULL,
    balance_after numeric(18,2) NOT NULL,
    txn_date timestamp with time zone DEFAULT now() NOT NULL,
    remark text,
    created_by character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fin_cash_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_cash_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_cash_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_cash_transactions_id_seq OWNED BY public.fin_cash_transactions.id;


--
-- Name: fin_exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_exchange_rates (
    id bigint NOT NULL,
    from_currency character varying(10) NOT NULL,
    to_currency character varying(10) NOT NULL,
    rate_date date NOT NULL,
    rate numeric(20,8) NOT NULL,
    rate_type character varying(20) DEFAULT 'MIDDLE'::character varying NOT NULL,
    source character varying(60),
    company_code character varying(64),
    created_by character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fin_exchange_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_exchange_rates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_exchange_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_exchange_rates_id_seq OWNED BY public.fin_exchange_rates.id;


--
-- Name: fin_expense_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_expense_requests (
    id bigint NOT NULL,
    expense_no character varying(64) NOT NULL,
    requester_id bigint,
    requester_name character varying(128),
    company_code character varying(32) NOT NULL,
    company_name character varying(128),
    project_code character varying(64),
    project_name character varying(128),
    expense_type character varying(32) NOT NULL,
    currency_code character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    amount_original numeric(18,2) NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    amount_base numeric(18,2) NOT NULL,
    base_currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    expense_date date,
    description text,
    attachment_urls jsonb,
    form_submission_id bigint,
    wf_instance_id bigint,
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fin_expense_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_expense_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_expense_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_expense_requests_id_seq OWNED BY public.fin_expense_requests.id;


--
-- Name: fin_fund_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_fund_transfers (
    id bigint NOT NULL,
    transfer_no character varying(60) NOT NULL,
    from_account_id bigint NOT NULL,
    from_account_code character varying(60) NOT NULL,
    from_account_name character varying(200) NOT NULL,
    to_account_id bigint NOT NULL,
    to_account_code character varying(60) NOT NULL,
    to_account_name character varying(200) NOT NULL,
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    currency_code character varying(8) NOT NULL,
    amount_original numeric(18,2) NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    base_currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    status character varying(30) DEFAULT 'DRAFT'::character varying NOT NULL,
    wf_instance_id bigint,
    out_txn_id bigint,
    in_txn_id bigint,
    remark text,
    created_by character varying(80),
    updated_by character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_fin_transfer_diff_accounts CHECK ((from_account_id <> to_account_id))
);


--
-- Name: fin_fund_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_fund_transfers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_fund_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_fund_transfers_id_seq OWNED BY public.fin_fund_transfers.id;


--
-- Name: fin_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_invoices (
    id integer NOT NULL,
    invoice_no character varying(64) NOT NULL,
    direction character varying(8),
    po_no character varying(64),
    order_no character varying(64),
    supplier character varying(128),
    customer character varying(128),
    amount numeric(18,2) DEFAULT 0,
    paid_amount numeric(18,2) DEFAULT 0,
    due_date date,
    status character varying(20) DEFAULT 'UNPAID'::character varying,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at text,
    customer_or_supplier character varying(256),
    ref_no character varying(128)
);


--
-- Name: fin_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_invoices_id_seq OWNED BY public.fin_invoices.id;


--
-- Name: fin_pay_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_pay_records (
    id integer NOT NULL,
    pay_no character varying(50),
    amount numeric(12,2) DEFAULT 0,
    pay_date date,
    method character varying(30),
    note text,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: fin_pay_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_pay_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_pay_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_pay_records_id_seq OWNED BY public.fin_pay_records.id;


--
-- Name: fin_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_payments (
    id integer NOT NULL,
    payment_no character varying(64) NOT NULL,
    invoice_no character varying(64),
    amount numeric(18,2) DEFAULT 0,
    method character varying(32),
    status character varying(20) DEFAULT 'COMPLETED'::character varying,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: fin_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_payments_id_seq OWNED BY public.fin_payments.id;


--
-- Name: fin_reimbursements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_reimbursements (
    id bigint NOT NULL,
    reimb_no character varying(64) NOT NULL,
    expense_request_id bigint NOT NULL,
    expense_no character varying(64) NOT NULL,
    employee_id bigint,
    employee_name character varying(128) NOT NULL,
    company_code character varying(32) NOT NULL,
    company_name character varying(128),
    currency_code character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    reimb_amount_original numeric(18,2) NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    reimb_amount_base numeric(18,2) NOT NULL,
    base_currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    cash_account_id bigint,
    cash_account_code character varying(64),
    payment_txn_id bigint,
    status character varying(32) DEFAULT 'PENDING'::character varying NOT NULL,
    wf_instance_id bigint,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fin_reimbursements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_reimbursements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_reimbursements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_reimbursements_id_seq OWNED BY public.fin_reimbursements.id;


--
-- Name: fin_shareholder_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_shareholder_contributions (
    id bigint NOT NULL,
    contribution_no character varying(60) NOT NULL,
    shareholder_id bigint,
    shareholder_code character varying(64),
    shareholder_name character varying(200) NOT NULL,
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    project_code character varying(64),
    project_name character varying(256),
    source_type character varying(30) DEFAULT 'MANUAL'::character varying NOT NULL,
    source_id bigint,
    source_no character varying(80),
    contribution_type character varying(40) NOT NULL,
    fund_nature character varying(40),
    currency_code character varying(8) NOT NULL,
    amount_original numeric(18,2) NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    base_currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    settled_amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    settled_amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    balance_amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    balance_amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    expected_return_date date,
    interest_rate numeric(8,4),
    status character varying(30) DEFAULT 'DRAFT'::character varying NOT NULL,
    wf_instance_id bigint,
    cash_account_id bigint,
    remark text,
    created_by character varying(80),
    updated_by character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fin_shareholder_contributions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_shareholder_contributions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_shareholder_contributions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_shareholder_contributions_id_seq OWNED BY public.fin_shareholder_contributions.id;


--
-- Name: fin_shareholder_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_shareholder_settlements (
    id bigint NOT NULL,
    settlement_no character varying(60) NOT NULL,
    contribution_id bigint NOT NULL,
    contribution_no character varying(60) NOT NULL,
    shareholder_id bigint,
    shareholder_code character varying(64),
    shareholder_name character varying(200) NOT NULL,
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    project_code character varying(64),
    project_name character varying(256),
    settlement_type character varying(30) NOT NULL,
    currency_code character varying(8) NOT NULL,
    amount_original numeric(18,2) NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    base_currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    cash_account_id bigint,
    cash_account_code character varying(60),
    out_txn_id bigint,
    status character varying(30) DEFAULT 'DRAFT'::character varying NOT NULL,
    wf_instance_id bigint,
    remark text,
    created_by character varying(80),
    updated_by character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fin_shareholder_settlements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_shareholder_settlements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_shareholder_settlements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_shareholder_settlements_id_seq OWNED BY public.fin_shareholder_settlements.id;


--
-- Name: fin_store_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_store_settlements (
    id integer NOT NULL,
    settle_no character varying(50),
    store_code character varying(30),
    period character varying(20),
    amount numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: fin_store_settlements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_store_settlements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_store_settlements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_store_settlements_id_seq OWNED BY public.fin_store_settlements.id;


--
-- Name: fin_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_transactions (
    id integer NOT NULL,
    txn_no character varying(64),
    transaction_no character varying(64),
    type character varying(16),
    account_code character varying(64),
    amount numeric(18,2) DEFAULT 0,
    currency_code character varying(8) DEFAULT 'LAK'::character varying,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    ref_no character varying(64),
    store_code character varying(64),
    operator character varying(64),
    description text,
    note text,
    due_date date,
    created_by integer,
    approved_by_mgr character varying(64),
    approved_by_gm character varying(64),
    approved_by_ceo character varying(64),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: fin_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_transactions_id_seq OWNED BY public.fin_transactions.id;


--
-- Name: inv_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_batches (
    id integer NOT NULL,
    batch_no character varying(64) NOT NULL,
    product_code character varying(64),
    qty integer DEFAULT 0,
    qty_available integer DEFAULT 0,
    status character varying(32) DEFAULT 'AVAILABLE'::character varying,
    warehouse_code character varying(64),
    location_code character varying(64),
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    expire_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    company_code character varying(64) DEFAULT 'ALL'::character varying,
    egg_date date,
    quality_grade character varying(16),
    packaging_spec character varying(64),
    source_type character varying(32),
    source_no character varying(64),
    sku_code character varying(64),
    grade_code_std character varying(32),
    spec_code character varying(64),
    packaging_batch_ref character varying(64),
    collection_batch_ref character varying(64),
    legacy_source character varying(32)
);


--
-- Name: COLUMN inv_batches.sku_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inv_batches.sku_code IS 'Phase H4: 关联 product_skus.sku_code，FIFO 优先按 SKU 路径分配';


--
-- Name: COLUMN inv_batches.grade_code_std; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inv_batches.grade_code_std IS 'Phase H4: 标准等级编码（product_grades.grade_code），与旧 quality_grade 并存';


--
-- Name: COLUMN inv_batches.spec_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inv_batches.spec_code IS 'Phase H4: 标准规格编码（packaging_specs.spec_code），与旧 packaging_spec 并存';


--
-- Name: inv_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inv_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inv_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inv_batches_id_seq OWNED BY public.inv_batches.id;


--
-- Name: inv_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_ledger (
    id integer NOT NULL,
    batch_no character varying(64),
    change_type character varying(32) NOT NULL,
    qty_change integer DEFAULT 0,
    operator character varying(64),
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    ref_no character varying(64),
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    batch_expire_date date,
    quality_grade character varying(16),
    company_code character varying(64) DEFAULT 'ALL'::character varying,
    sku_code character varying(64),
    log_date date,
    warehouse_code character varying(50),
    house_code character varying(50),
    customer_no character varying(100)
);


--
-- Name: COLUMN inv_ledger.sku_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inv_ledger.sku_code IS 'Phase H4: 从批次传递，用于按 SKU 维度追溯库存流水';


--
-- Name: inv_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inv_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inv_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inv_ledger_id_seq OWNED BY public.inv_ledger.id;


--
-- Name: inv_source_mode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_source_mode (
    id bigint NOT NULL,
    scope_level character varying(16) NOT NULL,
    scope_code character varying(64) NOT NULL,
    mode character varying(32) DEFAULT 'TEMP_PRODUCTION_INBOUND'::character varying NOT NULL,
    remark text,
    updated_by character varying(64),
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_inv_source_mode_level CHECK (((scope_level)::text = ANY ((ARRAY['GROUP'::character varying, 'COMPANY'::character varying, 'SITE'::character varying])::text[]))),
    CONSTRAINT chk_inv_source_mode_mode CHECK (((mode)::text = ANY ((ARRAY['TEMP_PRODUCTION_INBOUND'::character varying, 'PACKAGING_INBOUND'::character varying])::text[])))
);


--
-- Name: inv_source_mode_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_source_mode_audit (
    id bigint NOT NULL,
    scope_level character varying(16) NOT NULL,
    scope_code character varying(64) NOT NULL,
    old_mode character varying(32),
    new_mode character varying(32) NOT NULL,
    operator character varying(64),
    remark text,
    risk_snapshot jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inv_source_mode_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inv_source_mode_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inv_source_mode_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inv_source_mode_audit_id_seq OWNED BY public.inv_source_mode_audit.id;


--
-- Name: inv_source_mode_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inv_source_mode_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inv_source_mode_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inv_source_mode_id_seq OWNED BY public.inv_source_mode.id;


--
-- Name: lbl_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lbl_records (
    id integer NOT NULL,
    label_no character varying(64) NOT NULL,
    batch_no character varying(64),
    product_code character varying(64),
    qty integer DEFAULT 0,
    status character varying(20) DEFAULT 'PRINTED'::character varying,
    printed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: lbl_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lbl_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lbl_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lbl_records_id_seq OWNED BY public.lbl_records.id;


--
-- Name: log_dispatch_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.log_dispatch_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: log_dispatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_dispatch (
    dispatch_no text NOT NULL,
    plate_no text,
    driver_id text,
    driver text,
    vehicle text,
    date text,
    route text,
    stores text,
    status text DEFAULT 'PENDING'::text,
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at text,
    id bigint DEFAULT nextval('public.log_dispatch_id_seq'::regclass)
);


--
-- Name: TABLE log_dispatch; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.log_dispatch IS 'LEGACY READ_ONLY — Sales V2 Phase 4 已建立 sal_delivery_orders Runtime，禁止写入此表';


--
-- Name: log_drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_drivers (
    driver_id text NOT NULL,
    name text,
    license_no text,
    phone text,
    status text DEFAULT 'ACTIVE'::text,
    created_at text,
    updated_at text
);


--
-- Name: log_drivers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.log_drivers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: log_exceptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.log_exceptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: log_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_exceptions (
    id integer DEFAULT nextval('public.log_exceptions_id_seq'::regclass) NOT NULL,
    exp_no text,
    exception_no text,
    dispatch_no text,
    driver text,
    exp_type text,
    issue text,
    description text,
    severity character varying(20) DEFAULT 'LOW'::character varying,
    status text DEFAULT 'OPEN'::text,
    created_at character varying(255),
    updated_at text
);


--
-- Name: log_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.log_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: log_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_receipts (
    id integer DEFAULT nextval('public.log_receipts_id_seq'::regclass) NOT NULL,
    receipt_no text,
    dispatch_no text,
    wave_no text,
    store_code text,
    store_name text,
    signee text,
    plate_no text,
    receive_date text,
    qty integer,
    missing_qty text,
    condition text,
    status text DEFAULT 'PENDING'::text,
    remark text,
    sign_time character varying(255),
    created_at character varying(255),
    updated_at text
);


--
-- Name: log_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_routes (
    route_code text NOT NULL,
    start_point text,
    end_point text,
    distance_km numeric(18,2),
    est_hours numeric(18,2),
    created_at text,
    updated_at text
);


--
-- Name: TABLE log_routes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.log_routes IS 'LEGACY READ_ONLY — Sales V2 Phase 4 Delivery Runtime 已上线，路线数据迁移至 sal_delivery_orders.route_code';


--
-- Name: log_routes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.log_routes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: log_vehicles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.log_vehicles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: log_vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.log_vehicles (
    plate_no text NOT NULL,
    model text,
    capacity_kg numeric(18,2),
    status text DEFAULT 'ACTIVE'::text,
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    created_at text,
    updated_at text,
    id bigint DEFAULT nextval('public.log_vehicles_id_seq'::regclass)
);


--
-- Name: md_governance_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.md_governance_events (
    id bigint NOT NULL,
    event_type character varying(64) NOT NULL,
    object_type character varying(64),
    object_code character varying(128),
    severity character varying(16) DEFAULT 'MEDIUM'::character varying NOT NULL,
    payload jsonb,
    message text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE md_governance_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.md_governance_events IS 'G5.5-D: 主数据治理事件日志（归档阻断 / 冻结引用 / 字典覆盖率下降 / 工作流超时）';


--
-- Name: md_governance_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.md_governance_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: md_governance_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.md_governance_events_id_seq OWNED BY public.md_governance_events.id;


--
-- Name: md_governance_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.md_governance_snapshots (
    id bigint NOT NULL,
    overall integer NOT NULL,
    org_score integer NOT NULL,
    company_score integer NOT NULL,
    dict_score integer NOT NULL,
    user_org_score integer NOT NULL,
    reference_score integer NOT NULL,
    workflow_score integer NOT NULL,
    alert_count integer DEFAULT 0 NOT NULL,
    high_alert_count integer DEFAULT 0 NOT NULL,
    snapshot_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE md_governance_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.md_governance_snapshots IS 'G5.5-D: 主数据治理评分历史快照（每日 cron 写入），用于治理驾驶舱趋势图';


--
-- Name: md_governance_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.md_governance_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: md_governance_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.md_governance_snapshots_id_seq OWNED BY public.md_governance_snapshots.id;


--
-- Name: mon_device_alert_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mon_device_alert_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    erp_house_code character varying(50) NOT NULL,
    property_code character varying(50) NOT NULL,
    property_name character varying(100),
    current_val numeric(18,2),
    threshold_val numeric(18,2),
    unit character varying(20),
    triggered_at bigint,
    closed_at bigint,
    status character varying(20) DEFAULT 'OPEN'::character varying,
    confirmed_by character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mon_device_property_daily_agg; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mon_device_property_daily_agg (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    erp_house_code character varying(50) NOT NULL,
    property_code character varying(50) NOT NULL,
    agg_date date NOT NULL,
    avg_val numeric(18,2),
    max_val numeric(18,2),
    min_val numeric(18,2),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mon_device_property_dict; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mon_device_property_dict (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_code character varying(50) NOT NULL,
    name_zh character varying(100) NOT NULL,
    system_category character varying(50) DEFAULT 'other'::character varying,
    metric_type character varying(50) DEFAULT 'continuous'::character varying,
    display_level integer DEFAULT 4,
    ui_component_type character varying(50) DEFAULT 'matrix'::character varying,
    unit character varying(20),
    threshold_high numeric(18,2),
    threshold_low numeric(18,2),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mon_device_property_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mon_device_property_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    erp_house_code character varying(50) NOT NULL,
    property_code character varying(50) NOT NULL,
    value numeric(18,2),
    collect_time bigint,
    log_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mon_device_realtime_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mon_device_realtime_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    erp_house_code character varying(50) NOT NULL,
    property_code character varying(50) NOT NULL,
    value numeric(18,2),
    is_alarm integer DEFAULT 0,
    collect_time bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mon_house_device_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mon_house_device_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    erp_farm_code character varying(50) NOT NULL,
    erp_house_code character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    vendor_farm_id character varying(100),
    vendor_house_id character varying(100),
    mapped_by character varying(50),
    mapped_at timestamp without time zone DEFAULT now(),
    sync_freq_min integer DEFAULT 5,
    alert_config_json text,
    farm_name character varying(100),
    house_name character varying(100)
);


--
-- Name: mst_account_holders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_account_holders (
    id bigint NOT NULL,
    holder_code character varying(40) NOT NULL,
    holder_name character varying(120) NOT NULL,
    holder_type character varying(24) DEFAULT 'COMPANY'::character varying NOT NULL,
    ref_code character varying(64),
    status character varying(24) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mst_account_holders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mst_account_holders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mst_account_holders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mst_account_holders_id_seq OWNED BY public.mst_account_holders.id;


--
-- Name: mst_audit_trail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_audit_trail (
    id bigint NOT NULL,
    object_type character varying(40) NOT NULL,
    object_code character varying(64) NOT NULL,
    action character varying(24) NOT NULL,
    before_json jsonb,
    after_json jsonb,
    operator character varying(64),
    reason character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mst_audit_trail_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mst_audit_trail_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mst_audit_trail_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mst_audit_trail_id_seq OWNED BY public.mst_audit_trail.id;


--
-- Name: mst_bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_bank_accounts (
    id bigint NOT NULL,
    bank_acc_code character varying(40) NOT NULL,
    holder_code character varying(40) NOT NULL,
    bank_name character varying(120) NOT NULL,
    account_no character varying(64),
    currency_code character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    status character varying(24) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date,
    expire_date date
);


--
-- Name: mst_bank_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mst_bank_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mst_bank_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mst_bank_accounts_id_seq OWNED BY public.mst_bank_accounts.id;


--
-- Name: mst_code_seq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_code_seq (
    prefix character varying(16) NOT NULL,
    current_no bigint DEFAULT 0 NOT NULL,
    pad_len integer DEFAULT 5 NOT NULL,
    remark character varying(120),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE mst_code_seq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mst_code_seq IS '主数据编码序列注册表（G3-A 编码自动生成）';


--
-- Name: mst_merge_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_merge_log (
    id bigint NOT NULL,
    object_type character varying(40) NOT NULL,
    source_code character varying(64) NOT NULL,
    target_code character varying(64) NOT NULL,
    migrated_refs jsonb,
    operator character varying(64),
    reason character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mst_merge_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mst_merge_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mst_merge_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mst_merge_log_id_seq OWNED BY public.mst_merge_log.id;


--
-- Name: mst_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_products (
    id integer NOT NULL,
    product_code character varying(64) NOT NULL,
    product_name_zh character varying(128),
    product_name_lo character varying(128),
    category character varying(64),
    unit character varying(16) DEFAULT '个'::character varying,
    price numeric(18,4) DEFAULT 0,
    status character varying(16) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    price_retail numeric(10,4) DEFAULT 0,
    price_wholesale numeric(10,4) DEFAULT 0,
    product_name character varying(100),
    shelf_life_days integer DEFAULT 0,
    unit_lo character varying(20),
    unit_zh character varying(20),
    category_code character varying(64),
    image_url text,
    specs text,
    has_grade boolean DEFAULT true NOT NULL,
    has_spec boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE mst_products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mst_products IS '产品主档 — Phase H2 字段升级，补全 category_code / unit_zh / shelf_life_days / price_retail / has_grade / has_spec 等缺失字段';


--
-- Name: COLUMN mst_products.has_grade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mst_products.has_grade IS '是否按等级管理（TRUE=需选 grade_code，FALSE=单一等级产品）';


--
-- Name: COLUMN mst_products.has_spec; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mst_products.has_spec IS '是否按包装规格管理（TRUE=需选 spec_code，FALSE=散装/固定规格）';


--
-- Name: mst_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mst_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mst_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mst_products_id_seq OWNED BY public.mst_products.id;


--
-- Name: mst_stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mst_stores (
    id integer NOT NULL,
    store_code character varying(64) NOT NULL,
    store_name character varying(128),
    region character varying(64),
    manager character varying(64),
    status character varying(16) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    address text,
    phone character varying(30),
    company_code character varying(64),
    effective_date date,
    expire_date date,
    remark text
);


--
-- Name: mst_stores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mst_stores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mst_stores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mst_stores_id_seq OWNED BY public.mst_stores.id;


--
-- Name: ord_approval_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ord_approval_log (
    id integer NOT NULL,
    order_no character varying(50),
    action character varying(30),
    operator character varying(100),
    remark text,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: ord_approval_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ord_approval_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ord_approval_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ord_approval_log_id_seq OWNED BY public.ord_approval_log.id;


--
-- Name: ord_credit_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ord_credit_usage (
    id integer NOT NULL,
    customer_code character varying(50),
    order_no character varying(50),
    amount numeric(12,2) DEFAULT 0,
    type character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    action character varying(20),
    balance_after numeric(18,2)
);


--
-- Name: ord_credit_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ord_credit_usage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ord_credit_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ord_credit_usage_id_seq OWNED BY public.ord_credit_usage.id;


--
-- Name: ord_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ord_customers (
    id bigint NOT NULL,
    customer_name character varying(128),
    created_at timestamp without time zone DEFAULT now(),
    customer_code character varying(64),
    credit_limit numeric(18,2) DEFAULT 0,
    credit_used numeric(18,2) DEFAULT 0,
    blacklist boolean DEFAULT false,
    customer_type character varying(32) DEFAULT 'RETAIL'::character varying,
    phone character varying(32),
    address text,
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    region character varying(100),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    tier character varying(20),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    risk_flag character varying(20) DEFAULT 'NORMAL'::character varying,
    protection_status character varying(20) DEFAULT 'INIT'::character varying,
    current_owner_subject_id character varying(64)
);


--
-- Name: TABLE ord_customers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ord_customers IS '[LEGACY][READ_ONLY][Phase E封存] 禁止新业务写入 — 正式主档见 sal_customers';


--
-- Name: ord_customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ord_customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ord_customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ord_customers_id_seq OWNED BY public.ord_customers.id;


--
-- Name: ord_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ord_order_items (
    id integer NOT NULL,
    order_no character varying(50),
    product_code character varying(50),
    product_name_zh character varying(256),
    qty numeric(12,3) DEFAULT 0,
    unit character varying(20),
    unit_price numeric(10,4) DEFAULT 0,
    subtotal numeric(12,2) DEFAULT 0,
    amount numeric(12,2) DEFAULT 0,
    batch_no character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    grade character varying(20)
);


--
-- Name: ord_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ord_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ord_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ord_order_items_id_seq OWNED BY public.ord_order_items.id;


--
-- Name: ord_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ord_orders (
    id bigint NOT NULL,
    order_no character varying(64),
    status character varying(32) DEFAULT 'DRAFT'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    customer_id bigint,
    order_type character varying(32) DEFAULT 'SALE'::character varying,
    paid_amount numeric(18,2) DEFAULT 0,
    received_date date,
    sales_rep_id bigint,
    delivery_date date,
    remark text,
    currency_code character varying(8) DEFAULT 'LAK'::character varying,
    price_book_id character varying(64),
    need_price_approval boolean DEFAULT false,
    customer_code character varying(50),
    customer_name character varying(100),
    order_date date,
    total_amount numeric(12,2) DEFAULT 0,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sales_rep character varying(100),
    order_source character varying(50),
    subtotal numeric(12,2) DEFAULT 0,
    discount numeric(12,2) DEFAULT 0,
    need_credit_approval smallint DEFAULT 0,
    is_urgent smallint DEFAULT 0,
    delivery_addr text,
    expected_date date,
    created_by character varying(100),
    shipped_date date,
    cancel_reason text
);


--
-- Name: TABLE ord_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ord_orders IS '[LEGACY][READ_ONLY][Sales V2 Phase 3: 已被 sal_sales_orders 取代][冻结于 2026-05-27]';


--
-- Name: ord_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ord_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ord_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ord_orders_id_seq OWNED BY public.ord_orders.id;


--
-- Name: ord_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ord_prices (
    id integer NOT NULL,
    customer_code character varying(50),
    product_code character varying(50),
    price numeric(10,4) DEFAULT 0,
    effective_date date,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: ord_prices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ord_prices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ord_prices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ord_prices_id_seq OWNED BY public.ord_prices.id;


--
-- Name: packaging_specs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packaging_specs (
    id bigint NOT NULL,
    spec_code character varying(64) NOT NULL,
    spec_name character varying(128) NOT NULL,
    spec_name_lo character varying(128),
    qty_per_unit numeric(10,2) DEFAULT 1 NOT NULL,
    base_unit character varying(16) DEFAULT '枚'::character varying NOT NULL,
    display_unit character varying(16) DEFAULT '枚'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status character varying(16) DEFAULT 'ACTIVE'::character varying NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date,
    expire_date date
);


--
-- Name: TABLE packaging_specs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.packaging_specs IS '包装规格主数据 — Phase H2 建立，统一 packaging_spec 值集，含单位换算关系';


--
-- Name: packaging_specs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.packaging_specs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: packaging_specs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.packaging_specs_id_seq OWNED BY public.packaging_specs.id;


--
-- Name: pda_app_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pda_app_info (
    id integer NOT NULL,
    version character varying(32),
    apk_url character varying(255),
    changelog text,
    force_upgrade boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pda_app_info_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pda_app_info_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pda_app_info_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pda_app_info_id_seq OWNED BY public.pda_app_info.id;


--
-- Name: pda_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pda_sync_log (
    id integer NOT NULL,
    op_id character varying(64),
    pda_id character varying(64),
    task_no character varying(64),
    payload text,
    status character varying(20) DEFAULT 'PROCESSED'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    error_msg text
);


--
-- Name: pda_sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pda_sync_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pda_sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pda_sync_log_id_seq OWNED BY public.pda_sync_log.id;


--
-- Name: pda_system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pda_system_config (
    id integer NOT NULL,
    config_key character varying(64) NOT NULL,
    config_value text,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pda_system_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pda_system_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pda_system_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pda_system_config_id_seq OWNED BY public.pda_system_config.id;


--
-- Name: pda_terminals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pda_terminals (
    id integer NOT NULL,
    name character varying(128),
    brand character varying(64),
    model character varying(64),
    serial character varying(128),
    scan_protocol character varying(32),
    scan_prefix character varying(16),
    scan_suffix character varying(16),
    location character varying(128),
    enabled_modules text,
    printer_ip character varying(64),
    notes text,
    app_version character varying(32),
    status character varying(16) DEFAULT 'pending'::character varying,
    last_seen timestamp without time zone,
    created_at text
);


--
-- Name: pda_terminals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pda_terminals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pda_terminals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pda_terminals_id_seq OWNED BY public.pda_terminals.id;


--
-- Name: pilot_daily_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pilot_daily_reports (
    id bigint NOT NULL,
    pilot_run_id bigint NOT NULL,
    report_date date NOT NULL,
    order_count integer DEFAULT 0 NOT NULL,
    sales_amount numeric(18,2) DEFAULT 0 NOT NULL,
    delivery_count integer DEFAULT 0 NOT NULL,
    receipt_count integer DEFAULT 0 NOT NULL,
    return_count integer DEFAULT 0 NOT NULL,
    collection_count integer DEFAULT 0 NOT NULL,
    issue_count integer DEFAULT 0 NOT NULL,
    critical_issue_count integer DEFAULT 0 NOT NULL,
    new_feedback_count integer DEFAULT 0 NOT NULL,
    score numeric(5,2) DEFAULT 0 NOT NULL,
    score_status character varying(16) DEFAULT 'GREEN'::character varying NOT NULL,
    score_sales numeric(5,2) DEFAULT 0 NOT NULL,
    score_inventory numeric(5,2) DEFAULT 0 NOT NULL,
    score_delivery numeric(5,2) DEFAULT 0 NOT NULL,
    score_finance numeric(5,2) DEFAULT 0 NOT NULL,
    score_approval numeric(5,2) DEFAULT 0 NOT NULL,
    score_stability numeric(5,2) DEFAULT 0 NOT NULL,
    remark text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pilot_daily_reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pilot_daily_reports IS 'Pilot Run 每日自动日报，每天由 Scheduler 生成，也可手动触发';


--
-- Name: COLUMN pilot_daily_reports.score_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pilot_daily_reports.score_status IS 'GREEN≥80 / YELLOW≥60 / RED<60';


--
-- Name: pilot_daily_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pilot_daily_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pilot_daily_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pilot_daily_reports_id_seq OWNED BY public.pilot_daily_reports.id;


--
-- Name: pkg_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_audit_logs (
    id integer NOT NULL,
    entity_type character varying(50),
    entity_id character varying(100),
    action character varying(50),
    before_data text,
    after_data text,
    reason text,
    operator_id integer,
    terminal_id character varying(80),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: pkg_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_audit_logs_id_seq OWNED BY public.pkg_audit_logs.id;


--
-- Name: pkg_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_exceptions (
    id integer NOT NULL,
    nc_no character varying(80),
    issue_type character varying(50),
    exception_type character varying(50),
    severity character varying(20) DEFAULT 'MEDIUM'::character varying,
    batch_no character varying(80),
    related_batch_id character varying(80),
    store_code character varying(50),
    description text,
    action_taken character varying(50),
    reported_by character varying(100),
    quantity integer DEFAULT 0,
    status character varying(30) DEFAULT 'OPEN'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    photo_url text
);


--
-- Name: pkg_exceptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_exceptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_exceptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_exceptions_id_seq OWNED BY public.pkg_exceptions.id;


--
-- Name: pkg_grading_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_grading_records (
    id integer NOT NULL,
    code character varying(80) NOT NULL,
    shift_id integer,
    source_batch_code character varying(80),
    production_date date,
    outputs_json jsonb DEFAULT '{}'::jsonb,
    total_output integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: pkg_grading_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_grading_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_grading_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_grading_records_id_seq OWNED BY public.pkg_grading_records.id;


--
-- Name: pkg_handover_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_handover_records (
    id integer NOT NULL,
    code character varying(80) NOT NULL,
    shift_id integer,
    packing_code character varying(80),
    boxes_json jsonb DEFAULT '[]'::jsonb,
    box_count integer DEFAULT 0,
    pallet_code character varying(64),
    location character varying(128),
    receiver character varying(128),
    production_date date,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: pkg_handover_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_handover_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_handover_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_handover_records_id_seq OWNED BY public.pkg_handover_records.id;


--
-- Name: pkg_label_print_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_label_print_logs (
    id integer NOT NULL,
    box_code character varying(100),
    packaging_batch_id character varying(80),
    label_template_id character varying(80),
    printer_id character varying(80),
    print_type character varying(20) DEFAULT 'NORMAL'::character varying,
    print_status character varying(20) DEFAULT 'PRINTED'::character varying,
    printed_by character varying(100),
    reprint_reason text,
    old_label_code character varying(100),
    new_label_code character varying(100),
    printed_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: pkg_label_print_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_label_print_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_label_print_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_label_print_logs_id_seq OWNED BY public.pkg_label_print_logs.id;


--
-- Name: pkg_packing_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_packing_records (
    id integer NOT NULL,
    code character varying(80) NOT NULL,
    grading_code character varying(80),
    production_date date,
    batches_json jsonb DEFAULT '[]'::jsonb,
    total_boxes integer DEFAULT 0,
    total_eggs integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    shift_id integer,
    grading_codes_json jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: pkg_packing_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_packing_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_packing_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_packing_records_id_seq OWNED BY public.pkg_packing_records.id;


--
-- Name: pkg_qc_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_qc_inspections (
    id integer NOT NULL,
    source_batch_id character varying(80),
    sample_qty integer DEFAULT 0,
    broken_qty integer DEFAULT 0,
    dirty_qty integer DEFAULT 0,
    leaking_qty integer DEFAULT 0,
    abnormal_shape_qty integer DEFAULT 0,
    floor_egg_qty integer DEFAULT 0,
    average_weight numeric(8,2),
    shell_cleanliness_ok boolean DEFAULT true,
    odor_ok boolean DEFAULT true,
    container_cleanliness_ok boolean DEFAULT true,
    qc_result character varying(30) DEFAULT 'PENDING'::character varying,
    comment text,
    inspector_id integer,
    inspector_name character varying(100),
    inspected_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: pkg_qc_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_qc_inspections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_qc_inspections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_qc_inspections_id_seq OWNED BY public.pkg_qc_inspections.id;


--
-- Name: pkg_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_shifts (
    id integer NOT NULL,
    shift_no character varying(64) NOT NULL,
    house_code character varying(64),
    shift_type character varying(20) DEFAULT 'AM'::character varying,
    shift_date date,
    operator character varying(64),
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    bad_eggs integer DEFAULT 0,
    broken_eggs integer DEFAULT 0,
    broken_qty integer DEFAULT 0,
    completed_at timestamp without time zone,
    completed_time character varying(32),
    dirty_eggs integer DEFAULT 0,
    dirty_qty integer DEFAULT 0,
    eggs_collected integer DEFAULT 0,
    qualified_qty integer DEFAULT 0,
    reopen_reason text,
    shift_time character varying(64),
    total_qty integer DEFAULT 0,
    updated_by bigint
);


--
-- Name: pkg_shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_shifts_id_seq OWNED BY public.pkg_shifts.id;


--
-- Name: pkg_source_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_source_batches (
    id integer NOT NULL,
    batch_code character varying(80) NOT NULL,
    source_inbound_no character varying(80),
    production_date date,
    house_code character varying(50),
    flock_code character varying(50),
    lay_date date,
    expected_qty integer DEFAULT 0,
    received_qty integer DEFAULT 0,
    expected_weight numeric(10,2) DEFAULT 0,
    received_weight numeric(10,2) DEFAULT 0,
    container_count integer DEFAULT 0,
    variance_reason text,
    received_by integer,
    batch_status character varying(30) DEFAULT 'PENDING_RECEIVE'::character varying,
    qc_result character varying(30),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    shift_id integer
);


--
-- Name: pkg_source_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_source_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_source_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_source_batches_id_seq OWNED BY public.pkg_source_batches.id;


--
-- Name: pkg_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_tasks (
    id integer NOT NULL,
    task_no character varying(64) NOT NULL,
    batch_no character varying(64),
    source_item character varying(255),
    plan_qty integer DEFAULT 0,
    packed_qty integer DEFAULT 0,
    good_qty integer DEFAULT 0,
    defective_qty integer DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    task_type character varying(32) DEFAULT 'GRADING'::character varying,
    shift_id integer,
    house_code character varying(64),
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    anomaly_reason text,
    breakage_qty integer DEFAULT 0,
    breakage_rate numeric(8,4) DEFAULT 0,
    completed_at timestamp without time zone,
    completed_by bigint,
    discrepancy_qty integer DEFAULT 0,
    grade_results text,
    graded_at timestamp without time zone,
    graded_by bigint,
    output_qty integer DEFAULT 0,
    pack_spec character varying(64),
    presort_broken_qty integer DEFAULT 0,
    presort_dirty_qty integer DEFAULT 0,
    presort_xl_qty integer DEFAULT 0,
    remainder_qty integer DEFAULT 0
);


--
-- Name: pkg_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_tasks_id_seq OWNED BY public.pkg_tasks.id;


--
-- Name: pkg_work_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pkg_work_shifts (
    id integer NOT NULL,
    shift_code character varying(50) NOT NULL,
    production_date date NOT NULL,
    site_id character varying(50) DEFAULT 'site-01'::character varying,
    line_id character varying(50) DEFAULT 'line-01'::character varying,
    operator_id integer,
    operator_name character varying(100),
    supervisor_name character varying(100),
    status character varying(20) DEFAULT 'OPEN'::character varying,
    hygiene_check boolean DEFAULT true,
    device_check boolean DEFAULT true,
    variance_reason text,
    opened_at timestamp without time zone DEFAULT now(),
    closed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    shift_type character varying(20)
);


--
-- Name: pkg_work_shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pkg_work_shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pkg_work_shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pkg_work_shifts_id_seq OWNED BY public.pkg_work_shifts.id;


--
-- Name: pos_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_refunds (
    id integer NOT NULL,
    refund_no character varying(64) NOT NULL,
    original_sale_no character varying(64),
    store_code character varying(64),
    cashier character varying(64),
    refund_amount numeric(18,2) DEFAULT 0,
    refund_method character varying(32) DEFAULT 'CASH'::character varying,
    reason text,
    status character varying(20) DEFAULT 'COMPLETED'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pos_refunds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_refunds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_refunds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_refunds_id_seq OWNED BY public.pos_refunds.id;


--
-- Name: pos_sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_sale_items (
    id integer NOT NULL,
    sale_no character varying(64) NOT NULL,
    product_code character varying(64),
    product_name_zh character varying(128),
    product_name_lo character varying(128),
    batch_no character varying(64),
    qty integer DEFAULT 0,
    unit_price numeric(18,4) DEFAULT 0,
    subtotal numeric(18,2) DEFAULT 0,
    store_code character varying(64),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pos_sale_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_sale_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_sale_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_sale_items_id_seq OWNED BY public.pos_sale_items.id;


--
-- Name: pos_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_sales (
    id integer NOT NULL,
    sale_no character varying(64) NOT NULL,
    store_code character varying(64),
    cashier character varying(64),
    member_phone character varying(32),
    member_id character varying(64),
    total_amount numeric(18,2) DEFAULT 0,
    discount_amount numeric(18,2) DEFAULT 0,
    net_amount numeric(18,2) DEFAULT 0,
    paid_amount numeric(18,2) DEFAULT 0,
    payment_method character varying(32) DEFAULT 'CASH'::character varying,
    pay_method character varying(32) DEFAULT 'CASH'::character varying,
    status character varying(20) DEFAULT 'COMPLETED'::character varying,
    session_no character varying(64),
    sale_type character varying(32) DEFAULT 'NORMAL'::character varying,
    currency_code character varying(8) DEFAULT 'LAK'::character varying,
    note text,
    remark text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pos_sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_sales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_sales_id_seq OWNED BY public.pos_sales.id;


--
-- Name: pos_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_sessions (
    id integer NOT NULL,
    session_no character varying(60),
    store_code character varying(50),
    cashier character varying(50),
    opening_cash numeric(14,2) DEFAULT 0,
    closing_cash numeric(14,2) DEFAULT 0,
    total_sales numeric(18,2) DEFAULT 0,
    order_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'OPEN'::character varying,
    open_time text,
    close_time text,
    remark text
);


--
-- Name: pos_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_sessions_id_seq OWNED BY public.pos_sessions.id;


--
-- Name: prc2_ap_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_ap_ledger (
    id bigint NOT NULL,
    ap_no character varying(80) NOT NULL,
    po_id bigint,
    po_no character varying(80),
    company_id bigint,
    company_code character varying(64),
    company_name character varying(256),
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    supplier_id bigint,
    supplier_code character varying(64),
    supplier_name character varying(256),
    currency_code character varying(8),
    amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    paid_amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    balance_amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    status character varying(32) DEFAULT 'OPEN'::character varying NOT NULL,
    due_date date,
    remark text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_ap_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_ap_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_ap_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_ap_ledger_id_seq OWNED BY public.prc2_ap_ledger.id;


--
-- Name: prc2_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_approvals (
    id bigint NOT NULL,
    biz_type character varying(32) NOT NULL,
    biz_id bigint NOT NULL,
    biz_no character varying(80),
    approval_node character varying(64),
    approver_id bigint,
    approver_name character varying(128),
    action character varying(32),
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_approvals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_approvals_id_seq OWNED BY public.prc2_approvals.id;


--
-- Name: prc2_init_batch_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_init_batch_rows (
    id bigint NOT NULL,
    batch_id bigint NOT NULL,
    row_no integer NOT NULL,
    raw_data jsonb,
    status character varying(32) DEFAULT 'PENDING'::character varying NOT NULL,
    error_message text,
    related_po_id bigint,
    related_po_no character varying(80),
    related_payment_id bigint,
    related_pay_no character varying(80),
    related_fund_id bigint,
    related_fund_no character varying(80),
    related_receipt_id bigint,
    related_receipt_no character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_init_batch_rows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_init_batch_rows_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_init_batch_rows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_init_batch_rows_id_seq OWNED BY public.prc2_init_batch_rows.id;


--
-- Name: prc2_init_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_init_batches (
    id bigint NOT NULL,
    batch_no character varying(80) NOT NULL,
    batch_type character varying(64) NOT NULL,
    file_name character varying(256),
    file_url text,
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    success_rows integer DEFAULT 0 NOT NULL,
    failed_rows integer DEFAULT 0 NOT NULL,
    created_by bigint,
    created_by_name character varying(64),
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_init_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_init_batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_init_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_init_batches_id_seq OWNED BY public.prc2_init_batches.id;


--
-- Name: prc2_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_order_items (
    id bigint NOT NULL,
    po_id bigint NOT NULL,
    po_no character varying(80) NOT NULL,
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    item_code character varying(64),
    item_name character varying(256) NOT NULL,
    spec text,
    qty numeric(18,4) DEFAULT 0 NOT NULL,
    received_qty numeric(18,4) DEFAULT 0 NOT NULL,
    unit character varying(20),
    unit_price numeric(18,4) DEFAULT 0 NOT NULL,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    warehouse_code character varying(64),
    usage_desc text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_order_items_id_seq OWNED BY public.prc2_order_items.id;


--
-- Name: prc2_payment_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_payment_allocations (
    id bigint NOT NULL,
    payment_id bigint NOT NULL,
    po_id bigint,
    po_no character varying(80),
    ap_id bigint,
    ap_no character varying(80),
    company_id bigint,
    company_code character varying(64),
    company_name character varying(256),
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    allocated_amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    allocated_amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_payment_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_payment_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_payment_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_payment_allocations_id_seq OWNED BY public.prc2_payment_allocations.id;


--
-- Name: prc2_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_payments (
    id bigint NOT NULL,
    pay_no character varying(80) NOT NULL,
    payment_date date,
    company_id bigint,
    company_code character varying(64),
    company_name character varying(256),
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    payer_type character varying(32) NOT NULL,
    payer_id bigint,
    payer_name character varying(128) NOT NULL,
    payer_account character varying(128),
    payee_type character varying(32),
    payee_id bigint,
    payee_name character varying(256),
    payee_account character varying(128),
    currency_code character varying(8) NOT NULL,
    amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    base_currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    payment_method character varying(32),
    fund_nature character varying(32),
    is_shareholder_payment boolean DEFAULT false NOT NULL,
    shareholder_id bigint,
    shareholder_name character varying(128),
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    voucher_url text,
    remark text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_payments_id_seq OWNED BY public.prc2_payments.id;


--
-- Name: prc2_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_projects (
    id bigint NOT NULL,
    company_id bigint,
    company_code character varying(64),
    company_name character varying(256),
    project_code character varying(64) NOT NULL,
    project_name character varying(256) NOT NULL,
    project_type character varying(32),
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    start_date date,
    end_date date,
    remark text,
    project_manager_user_id bigint,
    project_manager_name character varying(128),
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date,
    expire_date date
);


--
-- Name: prc2_projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_projects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_projects_id_seq OWNED BY public.prc2_projects.id;


--
-- Name: prc2_purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_purchase_orders (
    id bigint NOT NULL,
    po_no character varying(80) NOT NULL,
    source_request_id bigint,
    source_req_no character varying(80),
    contract_no character varying(128),
    subject character varying(256) NOT NULL,
    company_id bigint,
    company_code character varying(64),
    company_name character varying(256),
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    supplier_id bigint,
    supplier_code character varying(64),
    supplier_name character varying(256),
    purchase_type character varying(32),
    cross_border_flag boolean DEFAULT false NOT NULL,
    origin_country character varying(8),
    destination_country character varying(8),
    currency_code character varying(8) DEFAULT 'LAK'::character varying NOT NULL,
    total_amount numeric(18,2) DEFAULT 0 NOT NULL,
    plan_qty numeric(18,4) DEFAULT 0 NOT NULL,
    received_qty numeric(18,4) DEFAULT 0 NOT NULL,
    paid_amount numeric(18,2) DEFAULT 0 NOT NULL,
    expected_date date,
    pay_deadline date,
    pay_terms text,
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    approval_status character varying(32) DEFAULT 'NONE'::character varying NOT NULL,
    approver_id bigint,
    approver_name character varying(128),
    approved_by bigint,
    approved_at timestamp with time zone,
    contract_url text,
    contract_note text,
    remark text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_purchase_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_purchase_orders_id_seq OWNED BY public.prc2_purchase_orders.id;


--
-- Name: prc2_purchase_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_purchase_requests (
    id bigint NOT NULL,
    req_no character varying(80) NOT NULL,
    subject character varying(256) NOT NULL,
    company_id bigint,
    company_code character varying(64),
    company_name character varying(256),
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    purchase_type character varying(32),
    urgency character varying(20) DEFAULT 'NORMAL'::character varying NOT NULL,
    currency_code character varying(8) DEFAULT 'LAK'::character varying NOT NULL,
    estimated_amount numeric(18,2) DEFAULT 0 NOT NULL,
    requester_id bigint,
    requester_name character varying(128),
    dept_code character varying(64),
    expected_date date,
    reason text,
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    converted_po_id bigint,
    converted_po_no character varying(80),
    attachment_url text,
    remark text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_purchase_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_purchase_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_purchase_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_purchase_requests_id_seq OWNED BY public.prc2_purchase_requests.id;


--
-- Name: prc2_receipt_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_receipt_items (
    id bigint NOT NULL,
    receipt_id bigint NOT NULL,
    po_item_id bigint,
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    item_code character varying(64),
    item_name character varying(256) NOT NULL,
    spec text,
    expected_qty numeric(18,4) DEFAULT 0 NOT NULL,
    actual_qty numeric(18,4) DEFAULT 0 NOT NULL,
    rejected_qty numeric(18,4) DEFAULT 0 NOT NULL,
    unit character varying(20),
    quality_status character varying(32),
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_receipt_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_receipt_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_receipt_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_receipt_items_id_seq OWNED BY public.prc2_receipt_items.id;


--
-- Name: prc2_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_receipts (
    id bigint NOT NULL,
    receipt_no character varying(80) NOT NULL,
    po_id bigint NOT NULL,
    po_no character varying(80) NOT NULL,
    shipment_id bigint,
    shipment_no character varying(80),
    company_id bigint,
    company_code character varying(64),
    company_name character varying(256),
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    warehouse_code character varying(64),
    receiver_id bigint,
    receiver_name character varying(128),
    receipt_date date,
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    confirmed_by bigint,
    confirmed_at timestamp with time zone,
    posted_by bigint,
    posted_at timestamp with time zone,
    remark text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_receipts_id_seq OWNED BY public.prc2_receipts.id;


--
-- Name: prc2_request_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_request_items (
    id bigint NOT NULL,
    request_id bigint NOT NULL,
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    item_code character varying(64),
    item_name character varying(256) NOT NULL,
    spec text,
    qty numeric(18,4) DEFAULT 0 NOT NULL,
    unit character varying(20),
    estimated_unit_price numeric(18,4) DEFAULT 0 NOT NULL,
    estimated_amount numeric(18,2) DEFAULT 0 NOT NULL,
    warehouse_code character varying(64),
    usage_desc text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_request_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_request_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_request_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_request_items_id_seq OWNED BY public.prc2_request_items.id;


--
-- Name: prc2_shareholder_funds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_shareholder_funds (
    id bigint NOT NULL,
    fund_no character varying(80) NOT NULL,
    shareholder_id bigint,
    shareholder_name character varying(128) NOT NULL,
    company_id bigint,
    company_code character varying(64),
    company_name character varying(256),
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    source_type character varying(32),
    fund_nature character varying(32),
    currency_code character varying(8),
    amount_original numeric(18,2) DEFAULT 0 NOT NULL,
    exchange_rate numeric(18,8) DEFAULT 1 NOT NULL,
    amount_base numeric(18,2) DEFAULT 0 NOT NULL,
    base_currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    related_payment_id bigint,
    related_po_id bigint,
    related_po_no character varying(80),
    occurred_date date,
    status character varying(32) DEFAULT 'CONFIRMED'::character varying NOT NULL,
    remark text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_shareholder_funds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_shareholder_funds_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_shareholder_funds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_shareholder_funds_id_seq OWNED BY public.prc2_shareholder_funds.id;


--
-- Name: prc2_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_shipments (
    id bigint NOT NULL,
    shipment_no character varying(80) NOT NULL,
    po_id bigint,
    po_no character varying(80),
    company_id bigint,
    company_code character varying(64),
    company_name character varying(256),
    project_id bigint,
    project_code character varying(64),
    project_name character varying(256),
    shipment_type character varying(32),
    carrier_name character varying(128),
    tracking_no character varying(128),
    origin_country character varying(8),
    origin_address text,
    destination_country character varying(8),
    destination_address text,
    customs_required boolean DEFAULT false NOT NULL,
    customs_status character varying(32),
    customs_decl_no character varying(128),
    departure_date date,
    arrival_date date,
    freight_amount numeric(18,2),
    freight_currency character varying(8),
    customs_duty numeric(18,2),
    customs_currency character varying(8),
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    remark text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prc2_shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_shipments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_shipments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_shipments_id_seq OWNED BY public.prc2_shipments.id;


--
-- Name: prc2_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc2_suppliers (
    id bigint NOT NULL,
    supplier_code character varying(64) NOT NULL,
    supplier_name character varying(256) NOT NULL,
    supplier_name_en character varying(256),
    country_code character varying(8),
    supplier_type character varying(32),
    default_currency character varying(8),
    contact_name character varying(64),
    contact_phone character varying(32),
    contact_email character varying(128),
    bank_name character varying(128),
    bank_account_name character varying(128),
    bank_account_no character varying(64),
    bank_swift character varying(32),
    tax_no character varying(64),
    address text,
    credit_days integer DEFAULT 30,
    payment_terms text,
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    shared_scope character varying(32) DEFAULT 'GROUP'::character varying NOT NULL,
    owner_company_id bigint,
    owner_company_code character varying(64),
    owner_company_name character varying(256),
    owner_project_id bigint,
    owner_project_code character varying(64),
    owner_project_name character varying(256),
    remark text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date,
    expire_date date
);


--
-- Name: prc2_suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc2_suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc2_suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc2_suppliers_id_seq OWNED BY public.prc2_suppliers.id;


--
-- Name: prc_contract_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_contract_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_price_books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc_price_books (
    id integer NOT NULL,
    price_book_id character varying(64),
    name character varying(256),
    status character varying(32) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: prc_price_books_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_price_books_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_price_books_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc_price_books_id_seq OWNED BY public.prc_price_books.id;


--
-- Name: prc_price_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc_price_items (
    id integer NOT NULL,
    item_id character varying(64) NOT NULL,
    product_code character varying(64),
    customer_type character varying(32) DEFAULT 'RETAIL'::character varying,
    retail_lower numeric(18,4) DEFAULT 0,
    retail_upper numeric(18,4) DEFAULT 0,
    base_price numeric(18,4) DEFAULT 0,
    effective_from date,
    effective_to date,
    status character varying(16) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    price_book_id character varying(64),
    sku_code character varying(64)
);


--
-- Name: TABLE prc_price_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.prc_price_items IS '[LEGACY][READ_ONLY][Sales用途已冻结] — Sales 定价已迁移至 sal_price_items（Sales V2 Phase 2）；采购定价仍由 Procurement V2 管理';


--
-- Name: prc_price_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_price_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_price_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc_price_items_id_seq OWNED BY public.prc_price_items.id;


--
-- Name: prc_purchase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc_purchase_items (
    id integer NOT NULL,
    po_no character varying(64),
    product_code character varying(64),
    product_name character varying(128),
    qty numeric(18,3) DEFAULT 0,
    unit_price numeric(18,4) DEFAULT 0,
    line_amount numeric(18,2) DEFAULT 0,
    received_qty numeric(18,3) DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    amount numeric(18,2) DEFAULT 0
);


--
-- Name: prc_purchase_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_purchase_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_purchase_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc_purchase_items_id_seq OWNED BY public.prc_purchase_items.id;


--
-- Name: prc_purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc_purchase_orders (
    id integer NOT NULL,
    po_no character varying(64) NOT NULL,
    supplier_code character varying(128),
    supplier_name character varying(256),
    subject character varying(256),
    total_amount numeric(18,2) DEFAULT 0,
    currency_code character varying(8) DEFAULT 'LAK'::character varying,
    status character varying(32) DEFAULT 'DRAFT'::character varying,
    plan_qty integer DEFAULT 0,
    received_qty integer DEFAULT 0,
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    expected_date date,
    remark text,
    created_by bigint,
    approved_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: prc_purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc_purchase_orders_id_seq OWNED BY public.prc_purchase_orders.id;


--
-- Name: prc_purchase_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc_purchase_payments (
    id integer NOT NULL,
    payment_no character varying(64) NOT NULL,
    po_no character varying(64),
    amount numeric(18,2) DEFAULT 0,
    method character varying(32),
    status character varying(20) DEFAULT 'COMPLETED'::character varying,
    paid_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: prc_purchase_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_purchase_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_purchase_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc_purchase_payments_id_seq OWNED BY public.prc_purchase_payments.id;


--
-- Name: prc_purchase_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc_purchase_requests (
    id integer NOT NULL,
    req_no character varying(64) NOT NULL,
    requester character varying(64),
    department character varying(64),
    subject character varying(256),
    status character varying(20) DEFAULT 'PENDING'::character varying,
    total_amount numeric(18,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    request_no character varying(64),
    attachment_url text
);


--
-- Name: prc_purchase_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_purchase_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_purchase_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc_purchase_requests_id_seq OWNED BY public.prc_purchase_requests.id;


--
-- Name: prc_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc_receipts (
    id integer NOT NULL,
    receipt_no character varying(50),
    order_no character varying(50),
    supplier_code character varying(50),
    receive_date date,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: prc_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc_receipts_id_seq OWNED BY public.prc_receipts.id;


--
-- Name: prc_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc_returns (
    id integer NOT NULL,
    return_no character varying(64) NOT NULL,
    po_no character varying(64),
    supplier_code character varying(64),
    amount numeric(18,2) DEFAULT 0,
    reason text,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    qty integer DEFAULT 0
);


--
-- Name: prc_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc_returns_id_seq OWNED BY public.prc_returns.id;


--
-- Name: prc_supplier_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc_supplier_returns (
    id integer NOT NULL,
    return_no character varying(50),
    supplier_code character varying(50),
    order_no character varying(50),
    reason text,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: prc_supplier_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_supplier_returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_supplier_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc_supplier_returns_id_seq OWNED BY public.prc_supplier_returns.id;


--
-- Name: prc_suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prc_suppliers (
    id integer DEFAULT nextval('public.prc_suppliers_id_seq'::regclass) NOT NULL,
    supplier_code character varying(64),
    supplier_name character varying(256),
    contact character varying(128),
    phone character varying(32),
    status character varying(32) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: prc_suppliers_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prc_suppliers_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prc_suppliers_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prc_suppliers_id_seq1 OWNED BY public.prc_suppliers.id;


--
-- Name: product_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_grades (
    id bigint NOT NULL,
    grade_code character varying(16) NOT NULL,
    grade_name character varying(64) NOT NULL,
    grade_name_lo character varying(64),
    sort_order integer DEFAULT 0 NOT NULL,
    is_saleable boolean DEFAULT true NOT NULL,
    is_storable boolean DEFAULT true NOT NULL,
    status character varying(16) DEFAULT 'ACTIVE'::character varying NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date,
    expire_date date
);


--
-- Name: TABLE product_grades; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_grades IS '产品等级主数据 — Phase H2 建立，统一 grade_code 值集（AA/A/B/C/DIRTY/CRACKED/BROKEN/DAMAGED）';


--
-- Name: product_grades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_grades_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_grades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_grades_id_seq OWNED BY public.product_grades.id;


--
-- Name: product_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_master (
    id bigint NOT NULL,
    product_code character varying(64) NOT NULL,
    product_name character varying(256) NOT NULL,
    product_name_en character varying(256),
    category character varying(64),
    uom character varying(32),
    default_grade character varying(16),
    shelf_life_days integer,
    status character varying(16) DEFAULT 'DRAFT'::character varying NOT NULL,
    effective_date date,
    expire_date date,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE product_master; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_master IS 'G5.5-C: 产品主档（SKU 的父对象，含 SPU 信息）';


--
-- Name: product_master_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_master_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_master_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_master_id_seq OWNED BY public.product_master.id;


--
-- Name: product_skus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_skus (
    id bigint NOT NULL,
    sku_code character varying(64) NOT NULL,
    product_code character varying(64) NOT NULL,
    product_name character varying(256),
    grade_code character varying(16) NOT NULL,
    spec_code character varying(64) NOT NULL,
    sku_name character varying(256),
    barcode character varying(64),
    status character varying(16) DEFAULT 'ACTIVE'::character varying NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date,
    expire_date date
);


--
-- Name: TABLE product_skus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_skus IS 'SKU 主数据 — Phase H2 建立。SKU = product_code + grade_code + spec_code 的唯一组合，为 H3（价格接 SKU）和 H4（库存接 SKU）做准备';


--
-- Name: product_skus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_skus_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_skus_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_skus_id_seq OWNED BY public.product_skus.id;


--
-- Name: qa_inspection_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qa_inspection_items (
    id integer NOT NULL,
    inspect_no character varying(50),
    item_name character varying(100),
    std_code character varying(50),
    actual_value numeric(10,4),
    pass boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: qa_inspection_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qa_inspection_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_inspection_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qa_inspection_items_id_seq OWNED BY public.qa_inspection_items.id;


--
-- Name: qa_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qa_inspections (
    id integer NOT NULL,
    inspect_no character varying(50),
    house_code character varying(50),
    inspect_date date,
    inspector character varying(100),
    result character varying(20),
    score numeric(5,2),
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    batch_no character varying(64),
    sku_code character varying(64),
    sample_qty integer DEFAULT 0,
    issues text,
    check_shell boolean DEFAULT false,
    check_weight boolean DEFAULT false,
    check_cleanness boolean DEFAULT false,
    check_grade boolean DEFAULT false,
    check_pack boolean DEFAULT false,
    check_label boolean DEFAULT false,
    insp_no character varying(64),
    items_json text,
    fail_items_json text
);


--
-- Name: qa_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qa_inspections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_inspections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qa_inspections_id_seq OWNED BY public.qa_inspections.id;


--
-- Name: qa_non_conformance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qa_non_conformance (
    id integer NOT NULL,
    ncr_no character varying(50),
    source character varying(100),
    description text,
    severity character varying(20) DEFAULT 'LOW'::character varying,
    status character varying(20) DEFAULT 'OPEN'::character varying,
    assignee character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    issue_type character varying(64),
    batch_no character varying(64)
);


--
-- Name: qa_non_conformance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qa_non_conformance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_non_conformance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qa_non_conformance_id_seq OWNED BY public.qa_non_conformance.id;


--
-- Name: qa_product_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qa_product_inspections (
    id integer NOT NULL,
    batch_no character varying(50),
    product_code character varying(50),
    sample_qty integer DEFAULT 0,
    pass_qty integer DEFAULT 0,
    result character varying(20),
    inspector character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: qa_product_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qa_product_inspections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_product_inspections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qa_product_inspections_id_seq OWNED BY public.qa_product_inspections.id;


--
-- Name: qa_standards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qa_standards (
    id integer NOT NULL,
    std_code character varying(50),
    name character varying(100),
    category character varying(50),
    threshold numeric(10,4),
    unit character varying(20),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: qa_standards_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qa_standards_history (
    id integer NOT NULL,
    std_code character varying(50),
    changed_by character varying(100),
    old_value text,
    new_value text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: qa_standards_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qa_standards_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_standards_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qa_standards_history_id_seq OWNED BY public.qa_standards_history.id;


--
-- Name: qa_standards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.qa_standards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_standards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.qa_standards_id_seq OWNED BY public.qa_standards.id;


--
-- Name: sal_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_channels (
    id bigint NOT NULL,
    channel_code character varying(64) NOT NULL,
    channel_name character varying(128) NOT NULL,
    channel_type character varying(32) DEFAULT 'RETAIL'::character varying NOT NULL,
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sal_channels; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_channels IS 'Sales V2 Phase 0 — 销售渠道主档';


--
-- Name: COLUMN sal_channels.channel_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_channels.channel_type IS 'DIRECT/DISTRIBUTOR/AGENT/RETAIL';


--
-- Name: sal_channels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_channels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_channels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_channels_id_seq OWNED BY public.sal_channels.id;


--
-- Name: sal_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_customers (
    id bigint NOT NULL,
    customer_no character varying(64) NOT NULL,
    customer_name character varying(128) NOT NULL,
    customer_type character varying(32) DEFAULT 'RETAIL'::character varying NOT NULL,
    channel_code character varying(64),
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    region_code character varying(64),
    credit_limit numeric(18,2) DEFAULT 0 NOT NULL,
    credit_used numeric(18,2) DEFAULT 0 NOT NULL,
    payment_terms integer DEFAULT 0 NOT NULL,
    risk_level character varying(32) DEFAULT 'NORMAL'::character varying NOT NULL,
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    sales_rep_id bigint,
    sales_rep_name character varying(128),
    contact_name character varying(128),
    contact_phone character varying(64),
    delivery_address text,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    credit_status character varying(32) DEFAULT 'NORMAL'::character varying NOT NULL,
    last_overdue_at timestamp with time zone,
    auto_frozen boolean DEFAULT false NOT NULL,
    legacy_customer_code character varying(50),
    protection_status character varying(20) DEFAULT 'INIT'::character varying,
    effective_date date,
    expire_date date
);


--
-- Name: TABLE sal_customers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_customers IS 'Sales V2 Phase 0 — 统一客户主档（取代 ord_customers + b2b_customers）';


--
-- Name: COLUMN sal_customers.customer_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.customer_type IS 'DIRECT_STORE/DISTRIBUTOR/AGENT/KEY_ACCOUNT/RETAIL';


--
-- Name: COLUMN sal_customers.credit_limit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.credit_limit IS '授信总额度';


--
-- Name: COLUMN sal_customers.credit_used; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.credit_used IS '已占用额度（由 Sales Order Runtime 维护）';


--
-- Name: COLUMN sal_customers.payment_terms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.payment_terms IS '账期天数（0=当天付款）';


--
-- Name: COLUMN sal_customers.risk_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.risk_level IS 'NORMAL/WATCH/BLACKLIST';


--
-- Name: COLUMN sal_customers.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.status IS 'ACTIVE/FROZEN/BLACKLIST';


--
-- Name: COLUMN sal_customers.credit_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.credit_status IS 'Sales V2 Phase 5 — NORMAL/WARNING/OVER_LIMIT/OVERDUE/FROZEN（系统计算，禁止手工改 credit_used）';


--
-- Name: COLUMN sal_customers.last_overdue_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.last_overdue_at IS 'Sales V2 Phase 5 — 最近一次逾期时间戳（由每日 Scheduler 写入）';


--
-- Name: COLUMN sal_customers.auto_frozen; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.auto_frozen IS 'Sales V2 Phase 5 — 系统自动冻结标志（true=Scheduler 冻结；false=手工冻结）';


--
-- Name: COLUMN sal_customers.legacy_customer_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.legacy_customer_code IS 'Phase G1 — 从 ord_customers/b2b_customers 迁入时保留原 customer_code，Phase G2 填充，Phase G3 废弃';


--
-- Name: COLUMN sal_customers.protection_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_customers.protection_status IS 'Phase G1 — 从 ord_customers 迁入的客户保护状态: INIT/OWNED/PROTECTED';


--
-- Name: sal_customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_customers_id_seq OWNED BY public.sal_customers.id;


--
-- Name: sal_delivery_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_delivery_order_items (
    id bigint NOT NULL,
    delivery_order_id bigint NOT NULL,
    sales_order_id bigint NOT NULL,
    sales_order_no character varying(64) NOT NULL,
    customer_code character varying(64),
    customer_name character varying(256),
    delivery_address text,
    planned_qty numeric(18,2) DEFAULT 0 NOT NULL,
    loaded_qty numeric(18,2) DEFAULT 0 NOT NULL,
    received_qty numeric(18,2) DEFAULT 0 NOT NULL,
    status character varying(32) DEFAULT 'PENDING'::character varying NOT NULL,
    receipt_id bigint,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sal_delivery_order_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_delivery_order_items IS 'Sales V2 Phase 4 — 配送单明细（每行对应一张销售订单）';


--
-- Name: sal_delivery_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_delivery_order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_delivery_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_delivery_order_items_id_seq OWNED BY public.sal_delivery_order_items.id;


--
-- Name: sal_delivery_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_delivery_orders (
    id bigint NOT NULL,
    delivery_no character varying(64) NOT NULL,
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    route_code character varying(64),
    route_name character varying(256),
    vehicle_id bigint,
    vehicle_no character varying(64),
    driver_id bigint,
    driver_name character varying(256),
    wave_date date,
    status character varying(32) DEFAULT 'PLANNED'::character varying NOT NULL,
    loading_start_at timestamp with time zone,
    loading_end_at timestamp with time zone,
    departure_at timestamp with time zone,
    expected_arrival_at timestamp with time zone,
    actual_arrival_at timestamp with time zone,
    completed_at timestamp with time zone,
    total_orders integer DEFAULT 0 NOT NULL,
    total_qty numeric(18,2) DEFAULT 0 NOT NULL,
    remark text,
    created_by character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    photo_urls text
);


--
-- Name: TABLE sal_delivery_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_delivery_orders IS 'Sales V2 Phase 4 — 配送单 Runtime（取代 log_dispatch Demo）';


--
-- Name: sal_delivery_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_delivery_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_delivery_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_delivery_orders_id_seq OWNED BY public.sal_delivery_orders.id;


--
-- Name: sal_drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_drivers (
    id bigint NOT NULL,
    driver_code character varying(64) NOT NULL,
    driver_name character varying(256) NOT NULL,
    phone character varying(32),
    license_no character varying(64),
    company_code character varying(64) NOT NULL,
    status character varying(16) DEFAULT 'ACTIVE'::character varying NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date,
    expire_date date
);


--
-- Name: TABLE sal_drivers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_drivers IS 'Sales V2 Phase 4 — 司机档案 Runtime（取代 log_drivers 遗留表）';


--
-- Name: sal_drivers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_drivers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_drivers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_drivers_id_seq OWNED BY public.sal_drivers.id;


--
-- Name: sal_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_order_items (
    id bigint NOT NULL,
    sales_order_id bigint NOT NULL,
    product_code character varying(64) NOT NULL,
    grade_code character varying(16),
    packaging_spec character varying(64),
    qty numeric(18,2) NOT NULL,
    unit_price numeric(18,2) NOT NULL,
    amount numeric(18,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    product_name character varying(256),
    resolved_unit_price numeric(18,2) DEFAULT 0 NOT NULL,
    actual_unit_price numeric(18,2) DEFAULT 0 NOT NULL,
    floor_price numeric(18,2),
    ceiling_price numeric(18,2),
    price_book_id bigint,
    price_book_no character varying(64),
    below_floor_price boolean DEFAULT false NOT NULL,
    allocated_batch_no character varying(128),
    allocated_qty numeric(18,2) DEFAULT 0,
    sku_code character varying(64)
);


--
-- Name: TABLE sal_order_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_order_items IS 'Sales V2 Phase 0 — 销售订单明细';


--
-- Name: COLUMN sal_order_items.sku_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_order_items.sku_code IS 'Phase H5: 关联 product_skus.sku_code，FIFO PATH A 优先按 SKU 路径分配';


--
-- Name: sal_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_order_items_id_seq OWNED BY public.sal_order_items.id;


--
-- Name: sal_price_books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_price_books (
    id bigint NOT NULL,
    price_book_no character varying(64) NOT NULL,
    price_book_name character varying(256) NOT NULL,
    channel_code character varying(64),
    customer_code character varying(64),
    effective_from date,
    effective_to date,
    company_code character varying(64) NOT NULL,
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    wf_instance_id bigint,
    created_by character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_name character varying(256),
    priority integer DEFAULT 100 NOT NULL,
    remark text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sal_price_books; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_price_books IS 'Sales V2 Phase 0 — 价格册（取代 ord_prices / prc_price_items Sales 部分）';


--
-- Name: COLUMN sal_price_books.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_books.status IS 'DRAFT/PENDING_APPROVAL/APPROVED/ACTIVE/EXPIRED/CANCELLED';


--
-- Name: COLUMN sal_price_books.wf_instance_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_books.wf_instance_id IS 'Workflow 2.0 审批实例 ID（价格变更审批）';


--
-- Name: COLUMN sal_price_books.company_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_books.company_name IS '公司名称（冗余，方便展示）';


--
-- Name: COLUMN sal_price_books.priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_books.priority IS '优先级：数字越小越优先（默认100）';


--
-- Name: COLUMN sal_price_books.remark; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_books.remark IS '备注';


--
-- Name: COLUMN sal_price_books.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_books.updated_at IS '最后更新时间';


--
-- Name: sal_price_books_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_price_books_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_price_books_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_price_books_id_seq OWNED BY public.sal_price_books.id;


--
-- Name: sal_price_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_price_items (
    id bigint NOT NULL,
    price_book_id bigint NOT NULL,
    product_code character varying(64) NOT NULL,
    grade_code character varying(16),
    packaging_spec character varying(64),
    unit_price numeric(18,2) NOT NULL,
    floor_price numeric(18,2),
    ceiling_price numeric(18,2),
    min_qty numeric(18,2),
    max_qty numeric(18,2),
    currency_code character varying(8) DEFAULT 'LAK'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    sku_code character varying(64),
    grade_code_std character varying(32),
    spec_code character varying(64)
);


--
-- Name: TABLE sal_price_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_price_items IS 'Sales V2 Phase 0 — 价格明细（支持按品级/规格/数量阶梯定价）';


--
-- Name: COLUMN sal_price_items.grade_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_items.grade_code IS '鸡蛋品级：0/1/2/3/4/5/DIRTY/BROKEN';


--
-- Name: COLUMN sal_price_items.packaging_spec; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_items.packaging_spec IS '包装规格：LOOSE/30_PCS_TRAY/360_PCS_CASE';


--
-- Name: COLUMN sal_price_items.floor_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_items.floor_price IS '底价（低于此须走 Workflow 低价审批）';


--
-- Name: COLUMN sal_price_items.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_items.status IS 'ACTIVE / DISABLED';


--
-- Name: COLUMN sal_price_items.sku_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_items.sku_code IS 'Phase H3: 关联 product_skus.sku_code，填写时价格解析优先按 SKU 精确匹配';


--
-- Name: COLUMN sal_price_items.grade_code_std; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_items.grade_code_std IS 'Phase H3: 标准等级编码（product_grades.grade_code），与旧 grade_code 字段并存';


--
-- Name: COLUMN sal_price_items.spec_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_price_items.spec_code IS 'Phase H3: 标准规格编码（packaging_specs.spec_code），与旧 packaging_spec 字段并存';


--
-- Name: sal_price_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_price_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_price_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_price_items_id_seq OWNED BY public.sal_price_items.id;


--
-- Name: sal_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_receipts (
    id bigint NOT NULL,
    receipt_no character varying(64) NOT NULL,
    delivery_order_id bigint NOT NULL,
    delivery_item_id bigint NOT NULL,
    sales_order_id bigint NOT NULL,
    sales_order_no character varying(64) NOT NULL,
    customer_code character varying(64),
    customer_name character varying(256),
    signed_by character varying(256),
    signed_at timestamp with time zone,
    received_qty numeric(18,2) DEFAULT 0 NOT NULL,
    exception_qty numeric(18,2) DEFAULT 0 NOT NULL,
    exception_type character varying(32),
    photo_urls jsonb,
    remark text,
    status character varying(16) DEFAULT 'SIGNED'::character varying NOT NULL,
    created_by character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sal_receipts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_receipts IS 'Sales V2 Phase 4 — 签收记录 Runtime（含异常签收）';


--
-- Name: sal_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_receipts_id_seq OWNED BY public.sal_receipts.id;


--
-- Name: sal_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_return_items (
    id bigint NOT NULL,
    return_order_id bigint NOT NULL,
    sales_order_item_id bigint,
    product_code character varying(64) NOT NULL,
    product_name character varying(256),
    grade_code character varying(32),
    packaging_spec character varying(128),
    returned_qty numeric(18,2) DEFAULT 0,
    accepted_qty numeric(18,2) DEFAULT 0,
    damaged_qty numeric(18,2) DEFAULT 0,
    unit_price numeric(18,2) DEFAULT 0,
    amount numeric(18,2) DEFAULT 0,
    inspection_result character varying(32) DEFAULT 'PENDING'::character varying,
    restock_status character varying(32) DEFAULT 'PENDING'::character varying,
    remark text,
    created_at timestamp with time zone DEFAULT now(),
    sku_code character varying(64)
);


--
-- Name: COLUMN sal_return_items.sku_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_return_items.sku_code IS 'Phase H5: 关联 product_skus.sku_code，从原销售明细 sal_order_items 继承，回库时传入 FIFO';


--
-- Name: sal_return_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_return_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_return_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_return_items_id_seq OWNED BY public.sal_return_items.id;


--
-- Name: sal_return_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_return_orders (
    id bigint NOT NULL,
    return_no character varying(64) NOT NULL,
    sales_order_id bigint,
    sales_order_no character varying(64),
    delivery_order_id bigint,
    customer_code character varying(64),
    customer_name character varying(256),
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    return_type character varying(32) NOT NULL,
    reason_code character varying(64),
    currency_code character varying(8) DEFAULT 'LAK'::character varying,
    subtotal numeric(18,2) DEFAULT 0,
    status character varying(32) DEFAULT 'DRAFT'::character varying,
    need_approval boolean DEFAULT false,
    wf_instance_id bigint,
    credit_note_id bigint,
    requested_at timestamp with time zone,
    inspected_at timestamp with time zone,
    restocked_at timestamp with time zone,
    completed_at timestamp with time zone,
    remark text,
    created_by character varying(128),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sal_return_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_return_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_return_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_return_orders_id_seq OWNED BY public.sal_return_orders.id;


--
-- Name: sal_sales_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_sales_orders (
    id bigint NOT NULL,
    order_no character varying(64) NOT NULL,
    customer_id bigint,
    customer_code character varying(64),
    customer_name character varying(256),
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    channel_code character varying(64),
    currency_code character varying(8) DEFAULT 'LAK'::character varying NOT NULL,
    subtotal numeric(18,2) DEFAULT 0 NOT NULL,
    discount numeric(18,2) DEFAULT 0 NOT NULL,
    total_amount numeric(18,2) DEFAULT 0 NOT NULL,
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    need_price_approval boolean DEFAULT false NOT NULL,
    need_credit_approval boolean DEFAULT false NOT NULL,
    wf_instance_id bigint,
    ar_invoice_id bigint,
    delivery_address text,
    remark text,
    created_by character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    channel_type character varying(32),
    price_book_id bigint,
    price_book_no character varying(64),
    over_credit boolean DEFAULT false NOT NULL,
    below_floor_price boolean DEFAULT false NOT NULL,
    expected_delivery_date date,
    delivered_at timestamp with time zone,
    received_at timestamp with time zone,
    credit_warning boolean DEFAULT false NOT NULL,
    credit_snapshot jsonb
);


--
-- Name: TABLE sal_sales_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_sales_orders IS 'Sales V2 Phase 0 — 销售订单基线（Phase 3 实装完整业务逻辑）';


--
-- Name: COLUMN sal_sales_orders.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_sales_orders.status IS 'DRAFT/PENDING_APPROVAL/APPROVED/ALLOCATED/PICKED/LOADED/SHIPPED/PARTIAL_SHIPPED/DELIVERED/RECEIVED/RECONCILED/REJECTED/CANCELLED';


--
-- Name: COLUMN sal_sales_orders.wf_instance_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_sales_orders.wf_instance_id IS 'Workflow 2.0 审批实例（价格/信用审批由 Phase 3 接入）';


--
-- Name: COLUMN sal_sales_orders.ar_invoice_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_sales_orders.ar_invoice_id IS 'Finance V2 fin_ar_invoices.id（订单签收后由 Sales V2 Phase 3 填入）';


--
-- Name: COLUMN sal_sales_orders.credit_warning; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_sales_orders.credit_warning IS 'Sales V2 Phase 5 — 提交时客户处于 WARNING 状态（有逾期但未超额）';


--
-- Name: COLUMN sal_sales_orders.credit_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_sales_orders.credit_snapshot IS 'Sales V2 Phase 5 — 提交时刻信用快照 JSONB（totalReceivable/overdueReceivable/overdueDays/creditLimit/availableCredit/creditStatus）';


--
-- Name: sal_sales_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_sales_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_sales_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_sales_orders_id_seq OWNED BY public.sal_sales_orders.id;


--
-- Name: sal_store_sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_store_sale_items (
    id bigint NOT NULL,
    sale_id bigint NOT NULL,
    product_code character varying(64) NOT NULL,
    product_name character varying(256) NOT NULL,
    grade_code character varying(64),
    packaging_spec character varying(128),
    qty numeric(12,3) NOT NULL,
    unit_price numeric(18,4) NOT NULL,
    amount numeric(18,2) NOT NULL,
    batch_no character varying(128),
    sort_order integer DEFAULT 0 NOT NULL,
    sku_code character varying(64)
);


--
-- Name: COLUMN sal_store_sale_items.sku_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sal_store_sale_items.sku_code IS 'Phase H5: 关联 product_skus.sku_code，门店收银 FIFO PATH A 使用';


--
-- Name: sal_store_sale_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_store_sale_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_store_sale_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_store_sale_items_id_seq OWNED BY public.sal_store_sale_items.id;


--
-- Name: sal_store_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_store_sales (
    id bigint NOT NULL,
    sale_no character varying(64) NOT NULL,
    store_code character varying(64) NOT NULL,
    store_name character varying(256) NOT NULL,
    company_code character varying(64) NOT NULL,
    company_name character varying(256),
    customer_code character varying(64),
    customer_name character varying(256),
    customer_id bigint,
    sale_type character varying(16) DEFAULT 'CASH'::character varying NOT NULL,
    payment_method character varying(32),
    subtotal numeric(18,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(18,2) DEFAULT 0 NOT NULL,
    total_amount numeric(18,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(18,2) DEFAULT 0 NOT NULL,
    receivable_amount numeric(18,2) DEFAULT 0 NOT NULL,
    payment_status character varying(16) DEFAULT 'UNPAID'::character varying NOT NULL,
    cash_account_id bigint,
    cash_account_code character varying(64),
    ar_invoice_id bigint,
    shift_closing_id bigint,
    status character varying(16) DEFAULT 'OPEN'::character varying NOT NULL,
    void_reason text,
    created_by bigint,
    created_by_name character varying(128),
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sal_store_sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_store_sales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_store_sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_store_sales_id_seq OWNED BY public.sal_store_sales.id;


--
-- Name: sal_store_shift_closings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_store_shift_closings (
    id bigint NOT NULL,
    closing_no character varying(64) NOT NULL,
    store_code character varying(64) NOT NULL,
    company_code character varying(64) NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    opening_cash numeric(18,2) DEFAULT 0 NOT NULL,
    closing_cash numeric(18,2),
    system_cash numeric(18,2),
    difference_amount numeric(18,2),
    total_sales numeric(18,2) DEFAULT 0 NOT NULL,
    cash_sales numeric(18,2) DEFAULT 0 NOT NULL,
    credit_sales numeric(18,2) DEFAULT 0 NOT NULL,
    sale_count integer DEFAULT 0 NOT NULL,
    status character varying(16) DEFAULT 'OPEN'::character varying NOT NULL,
    operator_id bigint,
    operator_name character varying(128),
    remark text
);


--
-- Name: sal_store_shift_closings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_store_shift_closings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_store_shift_closings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_store_shift_closings_id_seq OWNED BY public.sal_store_shift_closings.id;


--
-- Name: sal_vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_vehicles (
    id bigint NOT NULL,
    vehicle_no character varying(64) NOT NULL,
    plate_no character varying(32),
    vehicle_type character varying(64),
    capacity numeric(18,2),
    company_code character varying(64) NOT NULL,
    status character varying(16) DEFAULT 'ACTIVE'::character varying NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date,
    expire_date date
);


--
-- Name: TABLE sal_vehicles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sal_vehicles IS 'Sales V2 Phase 4 — 车辆档案 Runtime';


--
-- Name: sal_vehicles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sal_vehicles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sal_vehicles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sal_vehicles_id_seq OWNED BY public.sal_vehicles.id;


--
-- Name: seq_store_closing_no; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_store_closing_no
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seq_store_sale_no; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_store_sale_no
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seq_uat_feedback_no; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_uat_feedback_no
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seq_uat_pilot_no; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_uat_pilot_no
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seq_uat_training_no; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_uat_training_no
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shr_beneficial_equity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shr_beneficial_equity (
    id bigint NOT NULL,
    project_code character varying(64) NOT NULL,
    nominee_shareholder_code character varying(64) NOT NULL,
    beneficial_shareholder_code character varying(64) NOT NULL,
    amount numeric(18,2),
    ownership_ratio numeric(10,4),
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shr_beneficial_equity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shr_beneficial_equity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shr_beneficial_equity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shr_beneficial_equity_id_seq OWNED BY public.shr_beneficial_equity.id;


--
-- Name: shr_capital_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shr_capital_contributions (
    id bigint NOT NULL,
    contribution_no character varying(64) NOT NULL,
    project_code character varying(64) NOT NULL,
    shareholder_code character varying(64) NOT NULL,
    amount numeric(18,2) NOT NULL,
    currency character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    contribution_date date,
    payment_method character varying(64),
    source_type character varying(32) DEFAULT 'BANK_TRANSFER'::character varying NOT NULL,
    source_reference character varying(256),
    bank_account character varying(128),
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    remark text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    capital_flow_no character varying(64),
    attachment_count integer DEFAULT 0 NOT NULL,
    wf_instance_id bigint,
    confirmed_by bigint,
    confirmed_at timestamp with time zone,
    finance_bridge_status character varying(32) DEFAULT 'READ_ONLY'::character varying NOT NULL,
    reversal_of_id bigint,
    attachment_urls jsonb
);


--
-- Name: shr_capital_contributions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shr_capital_contributions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shr_capital_contributions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shr_capital_contributions_id_seq OWNED BY public.shr_capital_contributions.id;


--
-- Name: shr_project_equity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shr_project_equity (
    id bigint NOT NULL,
    project_code character varying(64) NOT NULL,
    shareholder_code character varying(64) NOT NULL,
    equity_ratio numeric(10,4) NOT NULL,
    subscribed_capital numeric(18,2),
    paid_in_capital numeric(18,2) DEFAULT 0 NOT NULL,
    unpaid_capital numeric(18,2) GENERATED ALWAYS AS ((COALESCE(subscribed_capital, (0)::numeric) - COALESCE(paid_in_capital, (0)::numeric))) STORED,
    capital_status character varying(32) DEFAULT 'PENDING_CONFIRMATION'::character varying NOT NULL,
    is_voting_shareholder boolean DEFAULT true NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    equity_status character varying(32) DEFAULT 'PROVISIONAL'::character varying NOT NULL,
    capital_ratio numeric(10,4),
    paid_in_source character varying(64)
);


--
-- Name: shr_project_equity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shr_project_equity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shr_project_equity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shr_project_equity_id_seq OWNED BY public.shr_project_equity.id;


--
-- Name: shr_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shr_projects (
    id bigint NOT NULL,
    project_code character varying(64) NOT NULL,
    project_name character varying(256) NOT NULL,
    company_code character varying(64),
    site_code character varying(64),
    project_type character varying(32) DEFAULT 'OTHER'::character varying NOT NULL,
    capital_status character varying(32) DEFAULT 'PENDING_CONFIRMATION'::character varying NOT NULL,
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    equity_status character varying(32) DEFAULT 'PROVISIONAL'::character varying NOT NULL,
    total_paid_in_capital numeric(18,2),
    effective_date date,
    expire_date date
);


--
-- Name: shr_projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shr_projects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shr_projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shr_projects_id_seq OWNED BY public.shr_projects.id;


--
-- Name: shr_shareholder_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shr_shareholder_scopes (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    shareholder_code character varying(64),
    scope_type character varying(32) NOT NULL,
    scope_code character varying(64),
    project_code character varying(64),
    can_view_finance boolean DEFAULT true NOT NULL,
    can_view_operation boolean DEFAULT true NOT NULL,
    can_view_dividend boolean DEFAULT true NOT NULL,
    can_approve boolean DEFAULT false NOT NULL,
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shr_shareholder_scopes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shr_shareholder_scopes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shr_shareholder_scopes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shr_shareholder_scopes_id_seq OWNED BY public.shr_shareholder_scopes.id;


--
-- Name: shr_shareholders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shr_shareholders (
    id bigint NOT NULL,
    shareholder_code character varying(64) NOT NULL,
    shareholder_name character varying(128) NOT NULL,
    linked_user_id bigint,
    phone character varying(32),
    id_no_masked character varying(64),
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date,
    expire_date date
);


--
-- Name: shr_shareholders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shr_shareholders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shr_shareholders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shr_shareholders_id_seq OWNED BY public.shr_shareholders.id;


--
-- Name: store_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_inventory (
    id integer NOT NULL,
    store_code character varying(30),
    product_code character varying(50),
    qty numeric(12,3) DEFAULT 0,
    last_count_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: store_inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_inventory_id_seq OWNED BY public.store_inventory.id;


--
-- Name: store_losses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_losses (
    id integer NOT NULL,
    loss_no character varying(50),
    store_code character varying(30),
    product_code character varying(50),
    qty numeric(12,3) DEFAULT 0,
    reason text,
    loss_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: store_losses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_losses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_losses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_losses_id_seq OWNED BY public.store_losses.id;


--
-- Name: store_receiving; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_receiving (
    id integer NOT NULL,
    receiving_no character varying(50),
    store_code character varying(30),
    wave_no character varying(50),
    receive_date date,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: store_receiving_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_receiving_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_receiving_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_receiving_id_seq OWNED BY public.store_receiving.id;


--
-- Name: store_receiving_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_receiving_items (
    id integer NOT NULL,
    receiving_no character varying(50),
    product_code character varying(50),
    qty numeric(12,3) DEFAULT 0,
    batch_no character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: store_receiving_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_receiving_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_receiving_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_receiving_items_id_seq OWNED BY public.store_receiving_items.id;


--
-- Name: store_replenish_req; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_replenish_req (
    id integer NOT NULL,
    req_no character varying(50),
    store_code character varying(30),
    product_code character varying(50),
    qty numeric(12,3) DEFAULT 0,
    urgency character varying(20) DEFAULT 'NORMAL'::character varying,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: store_replenish_req_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_replenish_req_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_replenish_req_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_replenish_req_id_seq OWNED BY public.store_replenish_req.id;


--
-- Name: store_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_transfers (
    id integer NOT NULL,
    transfer_no character varying(50),
    from_store character varying(30),
    to_store character varying(30),
    product_code character varying(50),
    qty numeric(12,3) DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: store_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_transfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_transfers_id_seq OWNED BY public.store_transfers.id;


--
-- Name: sys_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_alerts (
    id bigint NOT NULL,
    alert_type character varying(64) NOT NULL,
    severity character varying(16) DEFAULT 'WARNING'::character varying NOT NULL,
    title character varying(256) NOT NULL,
    detail jsonb,
    related_path text,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by character varying(64),
    resolved_remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_alerts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_alerts_id_seq OWNED BY public.sys_alerts.id;


--
-- Name: sys_approval_flows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_approval_flows_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_approval_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_approval_flows (
    id integer DEFAULT nextval('public.sys_approval_flows_id_seq'::regclass) NOT NULL,
    flow_code character varying(64),
    flow_name character varying(256),
    doc_type character varying(64),
    approver_chain text,
    status character varying(32) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sys_approval_flows_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_approval_flows_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_approval_flows_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_approval_flows_id_seq1 OWNED BY public.sys_approval_flows.id;


--
-- Name: sys_approval_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_approval_log (
    id bigint NOT NULL,
    doc_type character varying(64) NOT NULL,
    doc_id bigint NOT NULL,
    approver_role character varying(64) NOT NULL,
    approver_id bigint NOT NULL,
    action character varying(16) NOT NULL,
    comment text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sys_approval_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_approval_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_approval_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_approval_log_id_seq OWNED BY public.sys_approval_log.id;


--
-- Name: sys_approval_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_approval_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_approval_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_approval_rule (
    rule_id bigint NOT NULL,
    doc_type character varying(64) NOT NULL,
    amount_min numeric(18,2) DEFAULT 0 NOT NULL,
    amount_max numeric(18,2),
    currency_code character varying(8) DEFAULT 'CNY'::character varying NOT NULL,
    approver_chain jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_approval_rule_rule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_approval_rule_rule_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_approval_rule_rule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_approval_rule_rule_id_seq OWNED BY public.sys_approval_rule.rule_id;


--
-- Name: sys_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_audit_log (
    log_id bigint NOT NULL,
    user_id bigint NOT NULL,
    user_name character varying(64) NOT NULL,
    action character varying(32) NOT NULL,
    entity_type character varying(64),
    entity_id character varying(128),
    before_value jsonb,
    after_value jsonb,
    ip_addr character varying(64),
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_audit_log_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_audit_log_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_audit_log_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_audit_log_log_id_seq OWNED BY public.sys_audit_log.log_id;


--
-- Name: sys_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_configs (
    id bigint NOT NULL,
    config_group character varying(64) NOT NULL,
    config_key character varying(128) NOT NULL,
    config_value text NOT NULL,
    value_type character varying(16) DEFAULT 'STRING'::character varying NOT NULL,
    description text,
    is_encrypted boolean DEFAULT false NOT NULL,
    is_readonly boolean DEFAULT false NOT NULL,
    created_by character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying(64),
    updated_at timestamp with time zone
);


--
-- Name: sys_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_configs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_configs_id_seq OWNED BY public.sys_configs.id;


--
-- Name: sys_data_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_data_scopes (
    id bigint NOT NULL,
    role_code character varying(64) NOT NULL,
    module_code character varying(64) NOT NULL,
    scope_type character varying(16) DEFAULT 'COMPANY'::character varying NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sys_data_scopes_scope_type_check CHECK (((scope_type)::text = ANY ((ARRAY['SELF'::character varying, 'PROJECT'::character varying, 'COMPANY'::character varying, 'REGION'::character varying, 'GROUP'::character varying])::text[])))
);


--
-- Name: TABLE sys_data_scopes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sys_data_scopes IS 'RBAC 数据范围规则：角色 × 模块 → 可见范围等级';


--
-- Name: COLUMN sys_data_scopes.role_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sys_data_scopes.role_code IS '角色编码，如 ROLE_REGION_MGR';


--
-- Name: COLUMN sys_data_scopes.module_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sys_data_scopes.module_code IS '菜单/模块编码，如 MENU_PRC2_ORDER';


--
-- Name: COLUMN sys_data_scopes.scope_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sys_data_scopes.scope_type IS '范围等级：SELF<PROJECT<COMPANY<REGION<GROUP';


--
-- Name: COLUMN sys_data_scopes.enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sys_data_scopes.enabled IS '是否启用，false 时该规则不生效';


--
-- Name: sys_data_scopes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_data_scopes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_data_scopes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_data_scopes_id_seq OWNED BY public.sys_data_scopes.id;


--
-- Name: sys_dict; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_dict (
    id integer NOT NULL,
    dict_code character varying(64),
    dict_type character varying(64),
    name character varying(128),
    dict_label_zh character varying(128),
    dict_label_lo character varying(128),
    dict_label_en character varying(128),
    dict_value character varying(64),
    sort_no integer DEFAULT 0,
    status character varying(32) DEFAULT 'ACTIVE'::character varying,
    config_json text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    effective_date date,
    expire_date date,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: COLUMN sys_dict.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sys_dict.status IS 'G5.5-D: 字典 5 态生命周期 — DRAFT / PENDING_APPROVAL / ACTIVE / FROZEN / ARCHIVED';


--
-- Name: sys_dict_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_dict_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_dict_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_dict_id_seq OWNED BY public.sys_dict.id;


--
-- Name: sys_doc_state_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_doc_state_lock (
    lock_id bigint NOT NULL,
    doc_type character varying(64) NOT NULL,
    locked_state character varying(32) NOT NULL,
    locked_fields jsonb NOT NULL,
    unlock_role character varying(64)
);


--
-- Name: sys_doc_state_lock_lock_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_doc_state_lock_lock_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_doc_state_lock_lock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_doc_state_lock_lock_id_seq OWNED BY public.sys_doc_state_lock.lock_id;


--
-- Name: sys_error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_error_logs (
    id bigint NOT NULL,
    error_type character varying(64) DEFAULT 'UNKNOWN'::character varying NOT NULL,
    http_status integer,
    error_message text NOT NULL,
    stack_trace text,
    pg_error_code character varying(16),
    request_method character varying(10),
    request_path text,
    request_body jsonb,
    user_id bigint,
    username character varying(64),
    ip_address character varying(64),
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_error_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_error_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_error_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_error_logs_id_seq OWNED BY public.sys_error_logs.id;


--
-- Name: sys_exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_exchange_rates (
    id bigint NOT NULL,
    rate_date date NOT NULL,
    from_currency character varying(8) NOT NULL,
    to_currency character varying(8) NOT NULL,
    exchange_rate numeric(18,8) NOT NULL,
    source character varying(32) DEFAULT 'MANUAL'::character varying NOT NULL,
    remark text,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_exchange_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_exchange_rates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_exchange_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_exchange_rates_id_seq OWNED BY public.sys_exchange_rates.id;


--
-- Name: sys_menu; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_menu (
    menu_id bigint NOT NULL,
    menu_code character varying(64) NOT NULL,
    menu_name_zh character varying(128) NOT NULL,
    menu_name_lo character varying(128),
    domain character varying(32) NOT NULL,
    parent_code character varying(64),
    sort_order integer DEFAULT 0 NOT NULL,
    icon character varying(64),
    route character varying(128),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_menu_menu_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_menu_menu_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_menu_menu_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_menu_menu_id_seq OWNED BY public.sys_menu.menu_id;


--
-- Name: sys_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_notifications (
    id bigint NOT NULL,
    user_id bigint,
    notification_type character varying(32) DEFAULT 'WORKFLOW_TASK'::character varying NOT NULL,
    title character varying(256) NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    link_type character varying(32),
    link_id character varying(64),
    biz_type character varying(32),
    biz_id character varying(64),
    biz_no character varying(80),
    company_code character varying(64),
    status character varying(16) DEFAULT 'UNREAD'::character varying NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sys_notifications_status_check CHECK (((status)::text = ANY ((ARRAY['UNREAD'::character varying, 'READ'::character varying, 'ARCHIVED'::character varying])::text[])))
);


--
-- Name: TABLE sys_notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sys_notifications IS '站内通知：工作流任务提醒 / 信用预警 / 库存临期预警等';


--
-- Name: sys_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_notifications_id_seq OWNED BY public.sys_notifications.id;


--
-- Name: sys_operation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_operation_logs (
    id bigint NOT NULL,
    user_id bigint,
    username character varying(64),
    role_code character varying(64),
    module_code character varying(64),
    action_code character varying(32),
    biz_type character varying(64),
    biz_id bigint,
    biz_no character varying(80),
    request_method character varying(8),
    request_path character varying(256),
    ip_address character varying(64),
    user_agent text,
    before_data jsonb,
    after_data jsonb,
    result_status character varying(16) DEFAULT 'SUCCESS'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sys_operation_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sys_operation_logs IS '高敏感操作审计日志：支付/调拨/审批/权限变更等写操作追踪';


--
-- Name: sys_operation_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_operation_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_operation_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_operation_logs_id_seq OWNED BY public.sys_operation_logs.id;


--
-- Name: sys_organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_organizations (
    id bigint NOT NULL,
    org_code character varying(64) NOT NULL,
    org_name character varying(128) NOT NULL,
    parent_id bigint,
    org_type character varying(32) NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    path text,
    status character varying(16) DEFAULT 'ACTIVE'::character varying NOT NULL,
    company_code character varying(64),
    project_code character varying(64),
    warehouse_code character varying(64),
    remark text,
    manager_user_id bigint,
    manager_name character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    org_name_cn character varying(256),
    org_short_name character varying(64),
    parent_code character varying(64),
    site_code character varying(64),
    site_business_type character varying(64),
    sort_order integer DEFAULT 0 NOT NULL,
    effective_date date,
    expire_date date,
    CONSTRAINT chk_org_type CHECK (((org_type)::text = ANY ((ARRAY['GROUP'::character varying, 'COMPANY'::character varying, 'FACTORY'::character varying, 'PROJECT'::character varying, 'WAREHOUSE'::character varying, 'STORE'::character varying, 'DEPARTMENT'::character varying, 'BU'::character varying, 'SITE'::character varying, 'VIRTUAL_ORGANIZATION'::character varying])::text[])))
);


--
-- Name: TABLE sys_organizations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sys_organizations IS '组织架构：集团/公司/工厂/项目/仓库/门店/部门';


--
-- Name: COLUMN sys_organizations.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sys_organizations.status IS 'G5.5-D: 5 态生命周期 — DRAFT / PENDING_APPROVAL / ACTIVE / FROZEN / ARCHIVED / REJECTED';


--
-- Name: sys_organizations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_organizations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_organizations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_organizations_id_seq OWNED BY public.sys_organizations.id;


--
-- Name: sys_permission_set; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_permission_set (
    set_id bigint NOT NULL,
    set_code character varying(64) NOT NULL,
    set_name_zh character varying(128) NOT NULL,
    set_name_lo character varying(128),
    description text,
    created_by bigint,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_permission_set_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_permission_set_item (
    item_id bigint NOT NULL,
    set_id bigint NOT NULL,
    menu_id bigint NOT NULL,
    perm_codes character varying(64) NOT NULL,
    deny_codes character varying(64),
    scope_type character varying(16),
    scope_value character varying(64)
);


--
-- Name: sys_permission_set_item_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_permission_set_item_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_permission_set_item_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_permission_set_item_item_id_seq OWNED BY public.sys_permission_set_item.item_id;


--
-- Name: sys_permission_set_set_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_permission_set_set_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_permission_set_set_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_permission_set_set_id_seq OWNED BY public.sys_permission_set.set_id;


--
-- Name: sys_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_permissions (
    id integer DEFAULT nextval('public.sys_permissions_id_seq'::regclass) NOT NULL,
    perm_code character varying(64),
    perm_name character varying(256),
    resource character varying(128),
    action character varying(32),
    status character varying(32) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sys_permissions_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_permissions_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_permissions_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_permissions_id_seq1 OWNED BY public.sys_permissions.id;


--
-- Name: sys_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_role (
    role_id bigint NOT NULL,
    role_code character varying(64) NOT NULL,
    role_name_zh character varying(128) NOT NULL,
    role_name_lo character varying(128),
    role_type character varying(32) NOT NULL,
    approval_level smallint DEFAULT 0 NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_role_conflict; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_role_conflict (
    id bigint NOT NULL,
    menu_a character varying(64) NOT NULL,
    menu_b character varying(64) NOT NULL,
    reason_zh text,
    severity character varying(16) DEFAULT 'WARN'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_role_conflict_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_role_conflict_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_role_conflict_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_role_conflict_id_seq OWNED BY public.sys_role_conflict.id;


--
-- Name: sys_role_menu_permission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_role_menu_permission (
    perm_id bigint NOT NULL,
    role_id bigint NOT NULL,
    menu_id bigint NOT NULL,
    perm_codes character varying(32) NOT NULL,
    deny_codes character varying(64),
    scope_type character varying(16),
    scope_value character varying(64)
);


--
-- Name: sys_role_menu_permission_perm_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_role_menu_permission_perm_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_role_menu_permission_perm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_role_menu_permission_perm_id_seq OWNED BY public.sys_role_menu_permission.perm_id;


--
-- Name: sys_role_permission_set; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_role_permission_set (
    role_id bigint NOT NULL,
    set_id bigint NOT NULL
);


--
-- Name: sys_role_role_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_role_role_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_role_role_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_role_role_id_seq OWNED BY public.sys_role.role_id;


--
-- Name: sys_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_settings (
    key character varying(64) NOT NULL,
    value text,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: sys_store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_store (
    store_id bigint NOT NULL,
    store_code character varying(64) NOT NULL,
    store_name_zh character varying(128) NOT NULL,
    store_name_lo character varying(128),
    store_type character varying(32) NOT NULL,
    parent_code character varying(64),
    address character varying(256),
    contact_person character varying(64),
    contact_phone character varying(32),
    status smallint DEFAULT 1 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_store_store_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_store_store_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_store_store_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_store_store_id_seq OWNED BY public.sys_store.store_id;


--
-- Name: sys_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_user (
    user_id bigint NOT NULL,
    username character varying(64) NOT NULL,
    password_hash character varying(256) NOT NULL,
    real_name character varying(64) NOT NULL,
    phone character varying(32),
    email character varying(128),
    store_code character varying(64) DEFAULT 'ALL'::character varying NOT NULL,
    locale character varying(8) DEFAULT 'zh-CN'::character varying NOT NULL,
    status smallint DEFAULT 1 NOT NULL,
    last_login_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    note text,
    perms_version bigint DEFAULT 1 NOT NULL
);


--
-- Name: sys_user_orgs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_user_orgs (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    org_id bigint NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    data_scope_level character varying(16) DEFAULT 'COMPANY'::character varying NOT NULL,
    position_title character varying(128),
    is_manager boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    org_code character varying(64),
    role_scope character varying(32),
    CONSTRAINT chk_user_org_role_scope CHECK (((role_scope IS NULL) OR ((role_scope)::text = ANY ((ARRAY['GROUP'::character varying, 'BU'::character varying, 'COMPANY'::character varying, 'SITE'::character varying, 'DEPARTMENT'::character varying, 'STORE'::character varying, 'WAREHOUSE'::character varying])::text[])))),
    CONSTRAINT chk_user_org_scope_level CHECK (((data_scope_level)::text = ANY ((ARRAY['GROUP'::character varying, 'BU'::character varying, 'COMPANY'::character varying, 'SITE'::character varying, 'DEPARTMENT'::character varying, 'STORE'::character varying, 'WAREHOUSE'::character varying, 'SELF'::character varying, 'PROJECT'::character varying, 'REGION'::character varying])::text[])))
);


--
-- Name: TABLE sys_user_orgs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sys_user_orgs IS '用户-组织关联：决定非管理员用户的数据可见范围';


--
-- Name: sys_user_orgs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_user_orgs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_user_orgs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_user_orgs_id_seq OWNED BY public.sys_user_orgs.id;


--
-- Name: sys_user_permission_set; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_user_permission_set (
    user_id bigint NOT NULL,
    set_id bigint NOT NULL,
    granted_by bigint,
    granted_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_user_project_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_user_project_scopes (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    project_code character varying(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_user_project_scopes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_user_project_scopes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_user_project_scopes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_user_project_scopes_id_seq OWNED BY public.sys_user_project_scopes.id;


--
-- Name: sys_user_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_user_role (
    user_id bigint NOT NULL,
    role_id bigint NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    granted_at timestamp without time zone DEFAULT now() NOT NULL,
    granted_by bigint
);


--
-- Name: sys_user_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_user_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_user_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_user_user_id_seq OWNED BY public.sys_user.user_id;


--
-- Name: sys_user_warehouse_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_user_warehouse_scopes (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    warehouse_code character varying(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sys_user_warehouse_scopes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sys_user_warehouse_scopes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sys_user_warehouse_scopes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sys_user_warehouse_scopes_id_seq OWNED BY public.sys_user_warehouse_scopes.id;


--
-- Name: uat_checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uat_checklists (
    id bigint NOT NULL,
    module_code character varying(64) NOT NULL,
    item_name character varying(256) NOT NULL,
    item_description text,
    status character varying(32) DEFAULT 'NOT_STARTED'::character varying NOT NULL,
    tester_id bigint,
    tester_name character varying(128),
    tested_at timestamp with time zone,
    company_code character varying(64),
    remark text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: uat_checklists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uat_checklists_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uat_checklists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uat_checklists_id_seq OWNED BY public.uat_checklists.id;


--
-- Name: uat_feedbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uat_feedbacks (
    id bigint NOT NULL,
    feedback_no character varying(64) NOT NULL,
    title character varying(256) NOT NULL,
    description text,
    module_code character varying(64),
    company_code character varying(64),
    feedback_type character varying(32) DEFAULT 'BUG'::character varying NOT NULL,
    severity character varying(16) DEFAULT 'MEDIUM'::character varying NOT NULL,
    status character varying(32) DEFAULT 'OPEN'::character varying NOT NULL,
    reporter_id bigint,
    reporter_name character varying(128),
    assignee_id bigint,
    assignee_name character varying(128),
    screenshot_urls jsonb,
    resolution text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pilot_run_id bigint
);


--
-- Name: COLUMN uat_feedbacks.pilot_run_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.uat_feedbacks.pilot_run_id IS 'Pilot Run 1+: 关联试运行项目，问题闭环跟踪';


--
-- Name: uat_feedbacks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uat_feedbacks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uat_feedbacks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uat_feedbacks_id_seq OWNED BY public.uat_feedbacks.id;


--
-- Name: uat_pilot_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uat_pilot_runs (
    id bigint NOT NULL,
    run_no character varying(64) NOT NULL,
    company_code character varying(64),
    site_name character varying(256),
    run_start_date date NOT NULL,
    run_end_date date,
    status character varying(32) DEFAULT 'PLANNED'::character varying NOT NULL,
    order_count integer DEFAULT 0 NOT NULL,
    delivery_count integer DEFAULT 0 NOT NULL,
    receipt_count integer DEFAULT 0 NOT NULL,
    return_count integer DEFAULT 0 NOT NULL,
    issue_count integer DEFAULT 0 NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    project_no character varying(64),
    scope_desc text,
    team_size integer DEFAULT 0,
    go_live_score numeric(5,2),
    go_live_ready boolean DEFAULT false,
    sales_amount numeric(18,2) DEFAULT 0,
    collection_count integer DEFAULT 0,
    critical_issue_count integer DEFAULT 0
);


--
-- Name: uat_pilot_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uat_pilot_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uat_pilot_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uat_pilot_runs_id_seq OWNED BY public.uat_pilot_runs.id;


--
-- Name: uat_training_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uat_training_records (
    id bigint NOT NULL,
    training_no character varying(64) NOT NULL,
    training_type character varying(32) NOT NULL,
    training_title character varying(256) NOT NULL,
    trainer_name character varying(128),
    participant_count integer DEFAULT 0 NOT NULL,
    training_date date NOT NULL,
    score numeric(5,2),
    company_code character varying(64),
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: uat_training_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uat_training_records_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uat_training_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uat_training_records_id_seq OWNED BY public.uat_training_records.id;


--
-- Name: wf_approval_instance_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_approval_instance_steps (
    id bigint NOT NULL,
    instance_id bigint NOT NULL,
    step_no integer NOT NULL,
    approver_role character varying(255),
    approver_user_id bigint,
    approver_name character varying(255),
    status character varying(255) DEFAULT 'PENDING'::character varying NOT NULL,
    action character varying(255),
    comment text,
    acted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id bigint,
    actor_username character varying(64),
    required_role character varying(64),
    allow_admin_override boolean DEFAULT false NOT NULL,
    approver_type character varying(32) DEFAULT 'ROLE'::character varying NOT NULL,
    due_at timestamp with time zone,
    is_overdue boolean DEFAULT false NOT NULL,
    reminder_count integer DEFAULT 0 NOT NULL,
    last_reminded_at timestamp with time zone,
    escalation_level integer DEFAULT 0 NOT NULL,
    source_task_id bigint
);


--
-- Name: wf_approval_instance_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_approval_instance_steps_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_approval_instance_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_approval_instance_steps_id_seq OWNED BY public.wf_approval_instance_steps.id;


--
-- Name: wf_approval_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_approval_instances (
    id bigint NOT NULL,
    instance_no character varying(255) NOT NULL,
    module_code character varying(255) NOT NULL,
    biz_type character varying(255) NOT NULL,
    biz_id bigint NOT NULL,
    biz_no character varying(255),
    rule_id bigint,
    total_steps integer DEFAULT 1 NOT NULL,
    current_step_no integer DEFAULT 1 NOT NULL,
    status character varying(255) DEFAULT 'PENDING'::character varying NOT NULL,
    started_by bigint,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    amount numeric(18,2),
    currency_code character varying(8),
    company_code character varying(64),
    company_name character varying(256),
    project_code character varying(64),
    project_name character varying(256),
    subject character varying(256),
    form_submission_id bigint,
    form_code character varying(80),
    form_version_id bigint
);


--
-- Name: wf_approval_instances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_approval_instances_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_approval_instances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_approval_instances_id_seq OWNED BY public.wf_approval_instances.id;


--
-- Name: wf_approval_rule_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_approval_rule_steps (
    id bigint NOT NULL,
    rule_id bigint NOT NULL,
    step_no integer NOT NULL,
    approver_type character varying(255) DEFAULT 'ROLE'::character varying NOT NULL,
    approver_role character varying(255),
    approver_user_id bigint,
    org_scope character varying(255),
    required_approval_count integer DEFAULT 1 NOT NULL,
    allow_admin_override boolean DEFAULT false NOT NULL,
    sla_hours integer DEFAULT 48 NOT NULL,
    reminder_interval_hours integer DEFAULT 12 NOT NULL,
    max_reminders integer DEFAULT 3 NOT NULL,
    escalation_enabled boolean DEFAULT false NOT NULL,
    escalation_after_hours integer,
    escalation_role character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wf_approval_rule_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_approval_rule_steps_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_approval_rule_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_approval_rule_steps_id_seq OWNED BY public.wf_approval_rule_steps.id;


--
-- Name: wf_approval_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_approval_rules (
    id bigint NOT NULL,
    rule_code character varying(255) NOT NULL,
    module_code character varying(255) NOT NULL,
    biz_type character varying(255) NOT NULL,
    org_type character varying(255),
    company_code character varying(255),
    project_code character varying(255),
    currency_code character varying(255),
    min_amount numeric(18,2) DEFAULT 0 NOT NULL,
    max_amount numeric(18,2),
    condition_json jsonb,
    approval_mode character varying(255) DEFAULT 'SEQUENTIAL'::character varying NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wf_approval_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_approval_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_approval_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_approval_rules_id_seq OWNED BY public.wf_approval_rules.id;


--
-- Name: wf_cc_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_cc_task (
    id integer NOT NULL,
    instance_id integer NOT NULL,
    node_id character varying(120),
    receiver_user_id integer,
    receiver_role_code character varying(80),
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wf_cc_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_cc_task_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_cc_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_cc_task_id_seq OWNED BY public.wf_cc_task.id;


--
-- Name: wf_data_source; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_data_source (
    id integer NOT NULL,
    code character varying(80) NOT NULL,
    name character varying(160) NOT NULL,
    source_type character varying(20) NOT NULL,
    config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_synced_at timestamp without time zone,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wf_data_source_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_data_source_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_data_source_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_data_source_id_seq OWNED BY public.wf_data_source.id;


--
-- Name: wf_definition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_definition (
    id integer NOT NULL,
    code character varying(80) NOT NULL,
    name character varying(160) NOT NULL,
    description text,
    category character varying(80),
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    current_version_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wf_definition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_definition_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_definition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_definition_id_seq OWNED BY public.wf_definition.id;


--
-- Name: wf_definition_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_definition_version (
    id integer NOT NULL,
    definition_id integer NOT NULL,
    version_no integer NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    graph_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    form_version_id integer,
    published_by integer,
    published_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wf_definition_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_definition_version_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_definition_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_definition_version_id_seq OWNED BY public.wf_definition_version.id;


--
-- Name: wf_form_definition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_form_definition (
    id integer NOT NULL,
    code character varying(80) NOT NULL,
    name character varying(160) NOT NULL,
    description text,
    category character varying(80),
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    current_version_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    biz_type character varying(64),
    module_code character varying(64),
    remark text
);


--
-- Name: wf_form_definition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_form_definition_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_form_definition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_form_definition_id_seq OWNED BY public.wf_form_definition.id;


--
-- Name: wf_form_submission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_form_submission (
    id bigint NOT NULL,
    submission_no character varying(64) NOT NULL,
    form_code character varying(64) NOT NULL,
    form_version_id bigint NOT NULL,
    biz_type character varying(64),
    biz_id character varying(64),
    biz_no character varying(80),
    submitted_by bigint,
    submitted_by_name character varying(128),
    company_code character varying(64),
    company_name character varying(256),
    project_code character varying(64),
    project_name character varying(256),
    data_json jsonb,
    status character varying(32) DEFAULT 'SUBMITTED'::character varying NOT NULL,
    workflow_instance_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE wf_form_submission; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.wf_form_submission IS 'WF-2: 工作流表单提交记录（service workflow-form-runtime.service.ts 使用）';


--
-- Name: wf_form_submission_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_form_submission_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_form_submission_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_form_submission_id_seq OWNED BY public.wf_form_submission.id;


--
-- Name: wf_form_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_form_version (
    id integer NOT NULL,
    form_id integer NOT NULL,
    version_no integer NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    schema_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    published_by integer,
    published_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wf_form_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_form_version_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_form_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_form_version_id_seq OWNED BY public.wf_form_version.id;


--
-- Name: wf_instance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_instance (
    id integer NOT NULL,
    instance_no character varying(64) NOT NULL,
    definition_id integer NOT NULL,
    definition_version_id integer NOT NULL,
    form_version_id integer,
    title character varying(200),
    business_type character varying(80),
    business_id character varying(80),
    starter_id integer,
    starter_name character varying(120),
    status character varying(20) DEFAULT 'RUNNING'::character varying,
    current_node_id character varying(120),
    form_data_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    variables_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ended_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wf_instance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_instance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_instance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_instance_id_seq OWNED BY public.wf_instance.id;


--
-- Name: wf_instance_variable; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_instance_variable (
    id integer NOT NULL,
    instance_id integer NOT NULL,
    var_key character varying(120) NOT NULL,
    var_value text,
    value_type character varying(30),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wf_instance_variable_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_instance_variable_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_instance_variable_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_instance_variable_id_seq OWNED BY public.wf_instance_variable.id;


--
-- Name: wf_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_task (
    id integer NOT NULL,
    task_no character varying(64) NOT NULL,
    instance_id integer NOT NULL,
    node_id character varying(120) NOT NULL,
    node_name character varying(160),
    assignee_user_id integer,
    assignee_role_code character varying(80),
    status character varying(20) DEFAULT 'TODO'::character varying,
    action_result character varying(40),
    due_at timestamp without time zone,
    claimed_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wf_task_action; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wf_task_action (
    id integer NOT NULL,
    task_id integer,
    instance_id integer NOT NULL,
    action character varying(40) NOT NULL,
    actor_id integer,
    actor_name character varying(120),
    comment text,
    from_node_id character varying(120),
    to_node_id character varying(120),
    payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wf_task_action_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_task_action_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_task_action_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_task_action_id_seq OWNED BY public.wf_task_action.id;


--
-- Name: wf_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wf_task_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wf_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wf_task_id_seq OWNED BY public.wf_task.id;


--
-- Name: wms_inbound_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_inbound_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_inbound; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_inbound (
    id integer DEFAULT nextval('public.wms_inbound_id_seq'::regclass) NOT NULL,
    task_no character varying(64),
    status character varying(32) DEFAULT 'PENDING'::character varying,
    warehouse_code character varying(64),
    type character varying(64),
    item character varying(256),
    qty integer DEFAULT 0,
    store_code character varying(32),
    operator character varying(128),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    remark text
);


--
-- Name: COLUMN wms_inbound.remark; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.wms_inbound.remark IS '入库备注';


--
-- Name: wms_inbound_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_inbound_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_inbound_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_inbound_id_seq1 OWNED BY public.wms_inbound.id;


--
-- Name: wms_inbound_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_inbound_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_inbound_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_inbound_items (
    id integer DEFAULT nextval('public.wms_inbound_items_id_seq'::regclass) NOT NULL,
    task_no character varying(64),
    batch_no character varying(64),
    product_code character varying(64),
    qty integer DEFAULT 0,
    expected_qty integer DEFAULT 0,
    actual_qty integer DEFAULT 0,
    broken_qty integer DEFAULT 0,
    warehouse_code character varying(64),
    location_code character varying(64),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wms_inbound_items_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_inbound_items_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_inbound_items_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_inbound_items_id_seq1 OWNED BY public.wms_inbound_items.id;


--
-- Name: wms_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_locations (
    location_code character varying(64) NOT NULL,
    warehouse_code character varying(32) NOT NULL,
    zone_code character varying(32),
    location_name character varying(128),
    capacity_qty integer DEFAULT 0,
    status character varying(32) DEFAULT 'ACTIVE'::character varying,
    store_code character varying(32) DEFAULT 'ALL'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wms_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_locations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_outbound; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_outbound (
    id bigint NOT NULL,
    outbound_no character varying(64),
    status character varying(32) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    order_no character varying(64),
    operator character varying(64),
    item character varying(256),
    picker character varying(128),
    qty integer DEFAULT 0,
    ref_no character varying(128),
    type character varying(64),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    destination_type character varying(32),
    destination_house_code character varying(64),
    remark text
);


--
-- Name: COLUMN wms_outbound.destination_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.wms_outbound.destination_type IS '出库目的类型（字典 WMS_OUTBOUND_DESTINATION：HOUSE/KITCHEN/OFFICE/OTHER）';


--
-- Name: COLUMN wms_outbound.destination_house_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.wms_outbound.destination_house_code IS '当 destination_type=HOUSE 时引用 brd_houses.house_code（饲料投喂到具体鸡舍）';


--
-- Name: COLUMN wms_outbound.remark; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.wms_outbound.remark IS '出库备注';


--
-- Name: wms_outbound_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_outbound_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_outbound_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_outbound_id_seq OWNED BY public.wms_outbound.id;


--
-- Name: wms_outbound_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_outbound_items (
    id integer NOT NULL,
    task_no character varying(64),
    product_code character varying(64),
    batch_no character varying(64),
    qty integer DEFAULT 0,
    picked_qty integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    actual_qty integer DEFAULT 0,
    outbound_no character varying(64)
);


--
-- Name: wms_outbound_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_outbound_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_outbound_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_outbound_items_id_seq OWNED BY public.wms_outbound_items.id;


--
-- Name: wms_stock_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_stock_balance (
    id bigint NOT NULL,
    warehouse_code character varying(32) NOT NULL,
    location_code character varying(64) NOT NULL,
    spec_code character varying(64) NOT NULL,
    batch_no character varying(64) NOT NULL,
    qty integer DEFAULT 0,
    locked_qty integer DEFAULT 0,
    store_code character varying(32) DEFAULT 'ALL'::character varying,
    version integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wms_stock_balance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_stock_balance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_stock_balance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_stock_balance_id_seq OWNED BY public.wms_stock_balance.id;


--
-- Name: wms_stock_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_stock_ledger (
    id bigint NOT NULL,
    biz_type character varying(32) NOT NULL,
    bill_no character varying(64) NOT NULL,
    warehouse_code character varying(32) NOT NULL,
    location_code character varying(64) NOT NULL,
    spec_code character varying(64) NOT NULL,
    batch_no character varying(64) NOT NULL,
    in_qty integer DEFAULT 0,
    out_qty integer DEFAULT 0,
    balance_qty integer DEFAULT 0,
    store_code character varying(32) DEFAULT 'ALL'::character varying,
    operator character varying(64) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wms_stock_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_stock_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_stock_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_stock_ledger_id_seq OWNED BY public.wms_stock_ledger.id;


--
-- Name: wms_stock_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_stock_transfers (
    id integer NOT NULL,
    transfer_no character varying(50),
    from_location character varying(30),
    to_location character varying(30),
    product_code character varying(50),
    batch_no character varying(50),
    qty numeric(12,3) DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wms_stock_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_stock_transfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_stock_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_stock_transfers_id_seq OWNED BY public.wms_stock_transfers.id;


--
-- Name: wms_stocktake; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_stocktake (
    id integer NOT NULL,
    stocktake_no character varying(64) NOT NULL,
    warehouse_code character varying(64),
    status character varying(20) DEFAULT 'PENDING'::character varying,
    operator character varying(64),
    diff_qty integer DEFAULT 0,
    diff_amount numeric(18,2) DEFAULT 0,
    approved_by character varying(64),
    approved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    act_qty integer DEFAULT 0,
    auditor character varying(128),
    date character varying(32),
    item character varying(256),
    sys_qty integer DEFAULT 0
);


--
-- Name: wms_stocktake_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_stocktake_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_stocktake_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_stocktake_id_seq OWNED BY public.wms_stocktake.id;


--
-- Name: wms_suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_suppliers (
    id integer DEFAULT nextval('public.wms_suppliers_id_seq'::regclass) NOT NULL,
    supplier_code character varying(64),
    supplier_name character varying(256),
    contact character varying(128),
    phone character varying(32),
    status character varying(32) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wms_suppliers_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_suppliers_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_suppliers_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_suppliers_id_seq1 OWNED BY public.wms_suppliers.id;


--
-- Name: wms_transfer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_transfer (
    id integer NOT NULL,
    transfer_no character varying(50),
    from_warehouse character varying(64),
    to_warehouse character varying(64),
    from_zone character varying(30),
    to_zone character varying(30),
    product_code character varying(50),
    qty numeric(12,3) DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    operator_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: wms_transfer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_transfer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_transfer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_transfer_id_seq OWNED BY public.wms_transfer.id;


--
-- Name: wms_warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_warehouses (
    id integer NOT NULL,
    warehouse_code character varying(64) NOT NULL,
    warehouse_name character varying(128),
    store_code character varying(64) DEFAULT 'ALL'::character varying,
    status character varying(16) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    type character varying(32),
    warehouse_name_zh character varying(128),
    company_code character varying(64),
    manager character varying(64),
    effective_date date,
    expire_date date,
    remark text
);


--
-- Name: wms_warehouses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_warehouses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_warehouses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_warehouses_id_seq OWNED BY public.wms_warehouses.id;


--
-- Name: wms_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_zones (
    id integer NOT NULL,
    zone_code character varying(30),
    zone_name character varying(100),
    warehouse character varying(50),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    warehouse_code character varying(50)
);


--
-- Name: wms_zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wms_zones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wms_zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wms_zones_id_seq OWNED BY public.wms_zones.id;


--
-- Name: ws_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ws_contracts (
    id integer NOT NULL,
    contract_no character varying(50),
    customer_code character varying(50),
    product_code character varying(50),
    price numeric(10,4) DEFAULT 0,
    start_date date,
    end_date date,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: ws_contracts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ws_contracts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ws_contracts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ws_contracts_id_seq OWNED BY public.ws_contracts.id;


--
-- Name: ws_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ws_shipments (
    id integer NOT NULL,
    shipment_no character varying(50),
    contract_no character varying(50),
    dispatch_date date,
    qty numeric(12,3) DEFAULT 0,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: ws_shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ws_shipments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ws_shipments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ws_shipments_id_seq OWNED BY public.ws_shipments.id;


--
-- Name: acc_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_ledger ALTER COLUMN id SET DEFAULT nextval('public.acc_ledger_id_seq'::regclass);


--
-- Name: b2b_customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_customers ALTER COLUMN id SET DEFAULT nextval('public.b2b_customers_id_seq'::regclass);


--
-- Name: b2b_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_order_items ALTER COLUMN id SET DEFAULT nextval('public.b2b_order_items_id_seq'::regclass);


--
-- Name: b2b_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_orders ALTER COLUMN id SET DEFAULT nextval('public.b2b_orders_id_seq'::regclass);


--
-- Name: biz_cash_flow id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biz_cash_flow ALTER COLUMN id SET DEFAULT nextval('public.biz_cash_flow_id_seq'::regclass);


--
-- Name: biz_purchase_order id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biz_purchase_order ALTER COLUMN id SET DEFAULT nextval('public.biz_purchase_order_id_seq'::regclass);


--
-- Name: biz_sales_order order_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biz_sales_order ALTER COLUMN order_id SET DEFAULT nextval('public.biz_sales_order_order_id_seq'::regclass);


--
-- Name: brd_daily_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_daily_logs ALTER COLUMN id SET DEFAULT nextval('public.brd_daily_logs_id_seq'::regclass);


--
-- Name: brd_immune_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_immune_plans ALTER COLUMN id SET DEFAULT nextval('public.brd_immune_plans_id_seq'::regclass);


--
-- Name: brd_medication_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_medication_records ALTER COLUMN id SET DEFAULT nextval('public.brd_medication_records_id_seq'::regclass);


--
-- Name: brd_medications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_medications ALTER COLUMN id SET DEFAULT nextval('public.brd_medications_id_seq'::regclass);


--
-- Name: brd_vaccinations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_vaccinations ALTER COLUMN id SET DEFAULT nextval('public.brd_vaccinations_id_seq'::regclass);


--
-- Name: brd_withdrawal_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_withdrawal_alerts ALTER COLUMN id SET DEFAULT nextval('public.brd_withdrawal_alerts_id_seq'::regclass);


--
-- Name: chn_distributor_grading id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chn_distributor_grading ALTER COLUMN id SET DEFAULT nextval('public.chn_distributor_grading_id_seq'::regclass);


--
-- Name: crm_activities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities ALTER COLUMN id SET DEFAULT nextval('public.crm_activities_id_seq'::regclass);


--
-- Name: crm_coupons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_coupons ALTER COLUMN id SET DEFAULT nextval('public.crm_coupons_id_seq'::regclass);


--
-- Name: crm_levels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_levels ALTER COLUMN id SET DEFAULT nextval('public.crm_levels_id_seq'::regclass);


--
-- Name: crm_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_members ALTER COLUMN id SET DEFAULT nextval('public.crm_members_id_seq'::regclass);


--
-- Name: crm_points_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_points_ledger ALTER COLUMN id SET DEFAULT nextval('public.crm_points_ledger_id_seq'::regclass);


--
-- Name: crm_points_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_points_log ALTER COLUMN id SET DEFAULT nextval('public.crm_points_log_id_seq'::regclass);


--
-- Name: crm_points_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_points_rules ALTER COLUMN id SET DEFAULT nextval('public.crm_points_rules_id_seq'::regclass);


--
-- Name: cst_credit_warnings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cst_credit_warnings ALTER COLUMN id SET DEFAULT nextval('public.cst_credit_warnings_id_seq'::regclass);


--
-- Name: daily_close id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_close ALTER COLUMN id SET DEFAULT nextval('public.daily_close_id_seq'::regclass);


--
-- Name: data_quality_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_quality_alerts ALTER COLUMN id SET DEFAULT nextval('public.data_quality_alerts_id_seq'::regclass);


--
-- Name: data_quality_score_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_quality_score_snapshots ALTER COLUMN id SET DEFAULT nextval('public.data_quality_score_snapshots_id_seq'::regclass);


--
-- Name: fin_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_accounts ALTER COLUMN id SET DEFAULT nextval('public.fin_accounts_id_seq'::regclass);


--
-- Name: fin_ap_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ap_invoices ALTER COLUMN id SET DEFAULT nextval('public.fin_ap_invoices_id_seq'::regclass);


--
-- Name: fin_approvals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_approvals ALTER COLUMN id SET DEFAULT nextval('public.fin_approvals_id_seq'::regclass);


--
-- Name: fin_ar_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ar_invoices ALTER COLUMN id SET DEFAULT nextval('public.fin_ar_invoices_id_seq'::regclass);


--
-- Name: fin_ar_receipt_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ar_receipt_allocations ALTER COLUMN id SET DEFAULT nextval('public.fin_ar_receipt_allocations_id_seq'::regclass);


--
-- Name: fin_ar_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ar_receipts ALTER COLUMN id SET DEFAULT nextval('public.fin_ar_receipts_id_seq'::regclass);


--
-- Name: fin_bank_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_bank_accounts ALTER COLUMN id SET DEFAULT nextval('public.fin_bank_accounts_id_seq'::regclass);


--
-- Name: fin_cash_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_cash_accounts ALTER COLUMN id SET DEFAULT nextval('public.fin_cash_accounts_id_seq'::regclass);


--
-- Name: fin_cash_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_cash_transactions ALTER COLUMN id SET DEFAULT nextval('public.fin_cash_transactions_id_seq'::regclass);


--
-- Name: fin_exchange_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_exchange_rates ALTER COLUMN id SET DEFAULT nextval('public.fin_exchange_rates_id_seq'::regclass);


--
-- Name: fin_expense_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_expense_requests ALTER COLUMN id SET DEFAULT nextval('public.fin_expense_requests_id_seq'::regclass);


--
-- Name: fin_fund_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_fund_transfers ALTER COLUMN id SET DEFAULT nextval('public.fin_fund_transfers_id_seq'::regclass);


--
-- Name: fin_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_invoices ALTER COLUMN id SET DEFAULT nextval('public.fin_invoices_id_seq'::regclass);


--
-- Name: fin_pay_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_pay_records ALTER COLUMN id SET DEFAULT nextval('public.fin_pay_records_id_seq'::regclass);


--
-- Name: fin_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_payments ALTER COLUMN id SET DEFAULT nextval('public.fin_payments_id_seq'::regclass);


--
-- Name: fin_reimbursements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_reimbursements ALTER COLUMN id SET DEFAULT nextval('public.fin_reimbursements_id_seq'::regclass);


--
-- Name: fin_shareholder_contributions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_shareholder_contributions ALTER COLUMN id SET DEFAULT nextval('public.fin_shareholder_contributions_id_seq'::regclass);


--
-- Name: fin_shareholder_settlements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_shareholder_settlements ALTER COLUMN id SET DEFAULT nextval('public.fin_shareholder_settlements_id_seq'::regclass);


--
-- Name: fin_store_settlements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_store_settlements ALTER COLUMN id SET DEFAULT nextval('public.fin_store_settlements_id_seq'::regclass);


--
-- Name: fin_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_transactions ALTER COLUMN id SET DEFAULT nextval('public.fin_transactions_id_seq'::regclass);


--
-- Name: inv_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_batches ALTER COLUMN id SET DEFAULT nextval('public.inv_batches_id_seq'::regclass);


--
-- Name: inv_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_ledger ALTER COLUMN id SET DEFAULT nextval('public.inv_ledger_id_seq'::regclass);


--
-- Name: inv_source_mode id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_source_mode ALTER COLUMN id SET DEFAULT nextval('public.inv_source_mode_id_seq'::regclass);


--
-- Name: inv_source_mode_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_source_mode_audit ALTER COLUMN id SET DEFAULT nextval('public.inv_source_mode_audit_id_seq'::regclass);


--
-- Name: lbl_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lbl_records ALTER COLUMN id SET DEFAULT nextval('public.lbl_records_id_seq'::regclass);


--
-- Name: md_governance_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.md_governance_events ALTER COLUMN id SET DEFAULT nextval('public.md_governance_events_id_seq'::regclass);


--
-- Name: md_governance_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.md_governance_snapshots ALTER COLUMN id SET DEFAULT nextval('public.md_governance_snapshots_id_seq'::regclass);


--
-- Name: mst_account_holders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_account_holders ALTER COLUMN id SET DEFAULT nextval('public.mst_account_holders_id_seq'::regclass);


--
-- Name: mst_audit_trail id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_audit_trail ALTER COLUMN id SET DEFAULT nextval('public.mst_audit_trail_id_seq'::regclass);


--
-- Name: mst_bank_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_bank_accounts ALTER COLUMN id SET DEFAULT nextval('public.mst_bank_accounts_id_seq'::regclass);


--
-- Name: mst_merge_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_merge_log ALTER COLUMN id SET DEFAULT nextval('public.mst_merge_log_id_seq'::regclass);


--
-- Name: mst_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_products ALTER COLUMN id SET DEFAULT nextval('public.mst_products_id_seq'::regclass);


--
-- Name: mst_stores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_stores ALTER COLUMN id SET DEFAULT nextval('public.mst_stores_id_seq'::regclass);


--
-- Name: ord_approval_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_approval_log ALTER COLUMN id SET DEFAULT nextval('public.ord_approval_log_id_seq'::regclass);


--
-- Name: ord_credit_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_credit_usage ALTER COLUMN id SET DEFAULT nextval('public.ord_credit_usage_id_seq'::regclass);


--
-- Name: ord_customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_customers ALTER COLUMN id SET DEFAULT nextval('public.ord_customers_id_seq'::regclass);


--
-- Name: ord_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_order_items ALTER COLUMN id SET DEFAULT nextval('public.ord_order_items_id_seq'::regclass);


--
-- Name: ord_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_orders ALTER COLUMN id SET DEFAULT nextval('public.ord_orders_id_seq'::regclass);


--
-- Name: ord_prices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_prices ALTER COLUMN id SET DEFAULT nextval('public.ord_prices_id_seq'::regclass);


--
-- Name: packaging_specs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packaging_specs ALTER COLUMN id SET DEFAULT nextval('public.packaging_specs_id_seq'::regclass);


--
-- Name: pda_app_info id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_app_info ALTER COLUMN id SET DEFAULT nextval('public.pda_app_info_id_seq'::regclass);


--
-- Name: pda_sync_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_sync_log ALTER COLUMN id SET DEFAULT nextval('public.pda_sync_log_id_seq'::regclass);


--
-- Name: pda_system_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_system_config ALTER COLUMN id SET DEFAULT nextval('public.pda_system_config_id_seq'::regclass);


--
-- Name: pda_terminals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_terminals ALTER COLUMN id SET DEFAULT nextval('public.pda_terminals_id_seq'::regclass);


--
-- Name: pilot_daily_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_daily_reports ALTER COLUMN id SET DEFAULT nextval('public.pilot_daily_reports_id_seq'::regclass);


--
-- Name: pkg_audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.pkg_audit_logs_id_seq'::regclass);


--
-- Name: pkg_exceptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_exceptions ALTER COLUMN id SET DEFAULT nextval('public.pkg_exceptions_id_seq'::regclass);


--
-- Name: pkg_grading_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_grading_records ALTER COLUMN id SET DEFAULT nextval('public.pkg_grading_records_id_seq'::regclass);


--
-- Name: pkg_handover_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_handover_records ALTER COLUMN id SET DEFAULT nextval('public.pkg_handover_records_id_seq'::regclass);


--
-- Name: pkg_label_print_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_label_print_logs ALTER COLUMN id SET DEFAULT nextval('public.pkg_label_print_logs_id_seq'::regclass);


--
-- Name: pkg_packing_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_packing_records ALTER COLUMN id SET DEFAULT nextval('public.pkg_packing_records_id_seq'::regclass);


--
-- Name: pkg_qc_inspections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_qc_inspections ALTER COLUMN id SET DEFAULT nextval('public.pkg_qc_inspections_id_seq'::regclass);


--
-- Name: pkg_shifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_shifts ALTER COLUMN id SET DEFAULT nextval('public.pkg_shifts_id_seq'::regclass);


--
-- Name: pkg_source_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_source_batches ALTER COLUMN id SET DEFAULT nextval('public.pkg_source_batches_id_seq'::regclass);


--
-- Name: pkg_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_tasks ALTER COLUMN id SET DEFAULT nextval('public.pkg_tasks_id_seq'::regclass);


--
-- Name: pkg_work_shifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_work_shifts ALTER COLUMN id SET DEFAULT nextval('public.pkg_work_shifts_id_seq'::regclass);


--
-- Name: pos_refunds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_refunds ALTER COLUMN id SET DEFAULT nextval('public.pos_refunds_id_seq'::regclass);


--
-- Name: pos_sale_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sale_items ALTER COLUMN id SET DEFAULT nextval('public.pos_sale_items_id_seq'::regclass);


--
-- Name: pos_sales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sales ALTER COLUMN id SET DEFAULT nextval('public.pos_sales_id_seq'::regclass);


--
-- Name: pos_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions ALTER COLUMN id SET DEFAULT nextval('public.pos_sessions_id_seq'::regclass);


--
-- Name: prc2_ap_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_ap_ledger ALTER COLUMN id SET DEFAULT nextval('public.prc2_ap_ledger_id_seq'::regclass);


--
-- Name: prc2_approvals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_approvals ALTER COLUMN id SET DEFAULT nextval('public.prc2_approvals_id_seq'::regclass);


--
-- Name: prc2_init_batch_rows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_init_batch_rows ALTER COLUMN id SET DEFAULT nextval('public.prc2_init_batch_rows_id_seq'::regclass);


--
-- Name: prc2_init_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_init_batches ALTER COLUMN id SET DEFAULT nextval('public.prc2_init_batches_id_seq'::regclass);


--
-- Name: prc2_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_order_items ALTER COLUMN id SET DEFAULT nextval('public.prc2_order_items_id_seq'::regclass);


--
-- Name: prc2_payment_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_payment_allocations ALTER COLUMN id SET DEFAULT nextval('public.prc2_payment_allocations_id_seq'::regclass);


--
-- Name: prc2_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_payments ALTER COLUMN id SET DEFAULT nextval('public.prc2_payments_id_seq'::regclass);


--
-- Name: prc2_projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_projects ALTER COLUMN id SET DEFAULT nextval('public.prc2_projects_id_seq'::regclass);


--
-- Name: prc2_purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.prc2_purchase_orders_id_seq'::regclass);


--
-- Name: prc2_purchase_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_purchase_requests ALTER COLUMN id SET DEFAULT nextval('public.prc2_purchase_requests_id_seq'::regclass);


--
-- Name: prc2_receipt_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_receipt_items ALTER COLUMN id SET DEFAULT nextval('public.prc2_receipt_items_id_seq'::regclass);


--
-- Name: prc2_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_receipts ALTER COLUMN id SET DEFAULT nextval('public.prc2_receipts_id_seq'::regclass);


--
-- Name: prc2_request_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_request_items ALTER COLUMN id SET DEFAULT nextval('public.prc2_request_items_id_seq'::regclass);


--
-- Name: prc2_shareholder_funds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_shareholder_funds ALTER COLUMN id SET DEFAULT nextval('public.prc2_shareholder_funds_id_seq'::regclass);


--
-- Name: prc2_shipments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_shipments ALTER COLUMN id SET DEFAULT nextval('public.prc2_shipments_id_seq'::regclass);


--
-- Name: prc2_suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_suppliers ALTER COLUMN id SET DEFAULT nextval('public.prc2_suppliers_id_seq'::regclass);


--
-- Name: prc_price_books id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_price_books ALTER COLUMN id SET DEFAULT nextval('public.prc_price_books_id_seq'::regclass);


--
-- Name: prc_price_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_price_items ALTER COLUMN id SET DEFAULT nextval('public.prc_price_items_id_seq'::regclass);


--
-- Name: prc_purchase_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_items ALTER COLUMN id SET DEFAULT nextval('public.prc_purchase_items_id_seq'::regclass);


--
-- Name: prc_purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.prc_purchase_orders_id_seq'::regclass);


--
-- Name: prc_purchase_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_payments ALTER COLUMN id SET DEFAULT nextval('public.prc_purchase_payments_id_seq'::regclass);


--
-- Name: prc_purchase_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_requests ALTER COLUMN id SET DEFAULT nextval('public.prc_purchase_requests_id_seq'::regclass);


--
-- Name: prc_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_receipts ALTER COLUMN id SET DEFAULT nextval('public.prc_receipts_id_seq'::regclass);


--
-- Name: prc_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_returns ALTER COLUMN id SET DEFAULT nextval('public.prc_returns_id_seq'::regclass);


--
-- Name: prc_supplier_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_supplier_returns ALTER COLUMN id SET DEFAULT nextval('public.prc_supplier_returns_id_seq'::regclass);


--
-- Name: product_grades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_grades ALTER COLUMN id SET DEFAULT nextval('public.product_grades_id_seq'::regclass);


--
-- Name: product_master id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_master ALTER COLUMN id SET DEFAULT nextval('public.product_master_id_seq'::regclass);


--
-- Name: product_skus id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_skus ALTER COLUMN id SET DEFAULT nextval('public.product_skus_id_seq'::regclass);


--
-- Name: qa_inspection_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_inspection_items ALTER COLUMN id SET DEFAULT nextval('public.qa_inspection_items_id_seq'::regclass);


--
-- Name: qa_inspections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_inspections ALTER COLUMN id SET DEFAULT nextval('public.qa_inspections_id_seq'::regclass);


--
-- Name: qa_non_conformance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_non_conformance ALTER COLUMN id SET DEFAULT nextval('public.qa_non_conformance_id_seq'::regclass);


--
-- Name: qa_product_inspections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_product_inspections ALTER COLUMN id SET DEFAULT nextval('public.qa_product_inspections_id_seq'::regclass);


--
-- Name: qa_standards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_standards ALTER COLUMN id SET DEFAULT nextval('public.qa_standards_id_seq'::regclass);


--
-- Name: qa_standards_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_standards_history ALTER COLUMN id SET DEFAULT nextval('public.qa_standards_history_id_seq'::regclass);


--
-- Name: sal_channels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_channels ALTER COLUMN id SET DEFAULT nextval('public.sal_channels_id_seq'::regclass);


--
-- Name: sal_customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_customers ALTER COLUMN id SET DEFAULT nextval('public.sal_customers_id_seq'::regclass);


--
-- Name: sal_delivery_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_delivery_order_items ALTER COLUMN id SET DEFAULT nextval('public.sal_delivery_order_items_id_seq'::regclass);


--
-- Name: sal_delivery_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_delivery_orders ALTER COLUMN id SET DEFAULT nextval('public.sal_delivery_orders_id_seq'::regclass);


--
-- Name: sal_drivers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_drivers ALTER COLUMN id SET DEFAULT nextval('public.sal_drivers_id_seq'::regclass);


--
-- Name: sal_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_order_items ALTER COLUMN id SET DEFAULT nextval('public.sal_order_items_id_seq'::regclass);


--
-- Name: sal_price_books id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_price_books ALTER COLUMN id SET DEFAULT nextval('public.sal_price_books_id_seq'::regclass);


--
-- Name: sal_price_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_price_items ALTER COLUMN id SET DEFAULT nextval('public.sal_price_items_id_seq'::regclass);


--
-- Name: sal_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_receipts ALTER COLUMN id SET DEFAULT nextval('public.sal_receipts_id_seq'::regclass);


--
-- Name: sal_return_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_return_items ALTER COLUMN id SET DEFAULT nextval('public.sal_return_items_id_seq'::regclass);


--
-- Name: sal_return_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_return_orders ALTER COLUMN id SET DEFAULT nextval('public.sal_return_orders_id_seq'::regclass);


--
-- Name: sal_sales_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_sales_orders ALTER COLUMN id SET DEFAULT nextval('public.sal_sales_orders_id_seq'::regclass);


--
-- Name: sal_store_sale_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_store_sale_items ALTER COLUMN id SET DEFAULT nextval('public.sal_store_sale_items_id_seq'::regclass);


--
-- Name: sal_store_sales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_store_sales ALTER COLUMN id SET DEFAULT nextval('public.sal_store_sales_id_seq'::regclass);


--
-- Name: sal_store_shift_closings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_store_shift_closings ALTER COLUMN id SET DEFAULT nextval('public.sal_store_shift_closings_id_seq'::regclass);


--
-- Name: sal_vehicles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_vehicles ALTER COLUMN id SET DEFAULT nextval('public.sal_vehicles_id_seq'::regclass);


--
-- Name: shr_beneficial_equity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_beneficial_equity ALTER COLUMN id SET DEFAULT nextval('public.shr_beneficial_equity_id_seq'::regclass);


--
-- Name: shr_capital_contributions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_capital_contributions ALTER COLUMN id SET DEFAULT nextval('public.shr_capital_contributions_id_seq'::regclass);


--
-- Name: shr_project_equity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_project_equity ALTER COLUMN id SET DEFAULT nextval('public.shr_project_equity_id_seq'::regclass);


--
-- Name: shr_projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_projects ALTER COLUMN id SET DEFAULT nextval('public.shr_projects_id_seq'::regclass);


--
-- Name: shr_shareholder_scopes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_shareholder_scopes ALTER COLUMN id SET DEFAULT nextval('public.shr_shareholder_scopes_id_seq'::regclass);


--
-- Name: shr_shareholders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_shareholders ALTER COLUMN id SET DEFAULT nextval('public.shr_shareholders_id_seq'::regclass);


--
-- Name: store_inventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_inventory ALTER COLUMN id SET DEFAULT nextval('public.store_inventory_id_seq'::regclass);


--
-- Name: store_losses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_losses ALTER COLUMN id SET DEFAULT nextval('public.store_losses_id_seq'::regclass);


--
-- Name: store_receiving id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_receiving ALTER COLUMN id SET DEFAULT nextval('public.store_receiving_id_seq'::regclass);


--
-- Name: store_receiving_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_receiving_items ALTER COLUMN id SET DEFAULT nextval('public.store_receiving_items_id_seq'::regclass);


--
-- Name: store_replenish_req id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_replenish_req ALTER COLUMN id SET DEFAULT nextval('public.store_replenish_req_id_seq'::regclass);


--
-- Name: store_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_transfers ALTER COLUMN id SET DEFAULT nextval('public.store_transfers_id_seq'::regclass);


--
-- Name: sys_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_alerts ALTER COLUMN id SET DEFAULT nextval('public.sys_alerts_id_seq'::regclass);


--
-- Name: sys_approval_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_approval_log ALTER COLUMN id SET DEFAULT nextval('public.sys_approval_log_id_seq'::regclass);


--
-- Name: sys_approval_rule rule_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_approval_rule ALTER COLUMN rule_id SET DEFAULT nextval('public.sys_approval_rule_rule_id_seq'::regclass);


--
-- Name: sys_audit_log log_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_audit_log ALTER COLUMN log_id SET DEFAULT nextval('public.sys_audit_log_log_id_seq'::regclass);


--
-- Name: sys_configs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_configs ALTER COLUMN id SET DEFAULT nextval('public.sys_configs_id_seq'::regclass);


--
-- Name: sys_data_scopes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_data_scopes ALTER COLUMN id SET DEFAULT nextval('public.sys_data_scopes_id_seq'::regclass);


--
-- Name: sys_dict id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_dict ALTER COLUMN id SET DEFAULT nextval('public.sys_dict_id_seq'::regclass);


--
-- Name: sys_doc_state_lock lock_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_doc_state_lock ALTER COLUMN lock_id SET DEFAULT nextval('public.sys_doc_state_lock_lock_id_seq'::regclass);


--
-- Name: sys_error_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_error_logs ALTER COLUMN id SET DEFAULT nextval('public.sys_error_logs_id_seq'::regclass);


--
-- Name: sys_exchange_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_exchange_rates ALTER COLUMN id SET DEFAULT nextval('public.sys_exchange_rates_id_seq'::regclass);


--
-- Name: sys_menu menu_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_menu ALTER COLUMN menu_id SET DEFAULT nextval('public.sys_menu_menu_id_seq'::regclass);


--
-- Name: sys_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_notifications ALTER COLUMN id SET DEFAULT nextval('public.sys_notifications_id_seq'::regclass);


--
-- Name: sys_operation_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_operation_logs ALTER COLUMN id SET DEFAULT nextval('public.sys_operation_logs_id_seq'::regclass);


--
-- Name: sys_organizations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_organizations ALTER COLUMN id SET DEFAULT nextval('public.sys_organizations_id_seq'::regclass);


--
-- Name: sys_permission_set set_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permission_set ALTER COLUMN set_id SET DEFAULT nextval('public.sys_permission_set_set_id_seq'::regclass);


--
-- Name: sys_permission_set_item item_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permission_set_item ALTER COLUMN item_id SET DEFAULT nextval('public.sys_permission_set_item_item_id_seq'::regclass);


--
-- Name: sys_role role_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role ALTER COLUMN role_id SET DEFAULT nextval('public.sys_role_role_id_seq'::regclass);


--
-- Name: sys_role_conflict id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_conflict ALTER COLUMN id SET DEFAULT nextval('public.sys_role_conflict_id_seq'::regclass);


--
-- Name: sys_role_menu_permission perm_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_menu_permission ALTER COLUMN perm_id SET DEFAULT nextval('public.sys_role_menu_permission_perm_id_seq'::regclass);


--
-- Name: sys_store store_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_store ALTER COLUMN store_id SET DEFAULT nextval('public.sys_store_store_id_seq'::regclass);


--
-- Name: sys_user user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user ALTER COLUMN user_id SET DEFAULT nextval('public.sys_user_user_id_seq'::regclass);


--
-- Name: sys_user_orgs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_orgs ALTER COLUMN id SET DEFAULT nextval('public.sys_user_orgs_id_seq'::regclass);


--
-- Name: sys_user_project_scopes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_project_scopes ALTER COLUMN id SET DEFAULT nextval('public.sys_user_project_scopes_id_seq'::regclass);


--
-- Name: sys_user_warehouse_scopes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_warehouse_scopes ALTER COLUMN id SET DEFAULT nextval('public.sys_user_warehouse_scopes_id_seq'::regclass);


--
-- Name: uat_checklists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_checklists ALTER COLUMN id SET DEFAULT nextval('public.uat_checklists_id_seq'::regclass);


--
-- Name: uat_feedbacks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_feedbacks ALTER COLUMN id SET DEFAULT nextval('public.uat_feedbacks_id_seq'::regclass);


--
-- Name: uat_pilot_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_pilot_runs ALTER COLUMN id SET DEFAULT nextval('public.uat_pilot_runs_id_seq'::regclass);


--
-- Name: uat_training_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_training_records ALTER COLUMN id SET DEFAULT nextval('public.uat_training_records_id_seq'::regclass);


--
-- Name: wf_approval_instance_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_approval_instance_steps ALTER COLUMN id SET DEFAULT nextval('public.wf_approval_instance_steps_id_seq'::regclass);


--
-- Name: wf_approval_instances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_approval_instances ALTER COLUMN id SET DEFAULT nextval('public.wf_approval_instances_id_seq'::regclass);


--
-- Name: wf_approval_rule_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_approval_rule_steps ALTER COLUMN id SET DEFAULT nextval('public.wf_approval_rule_steps_id_seq'::regclass);


--
-- Name: wf_approval_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_approval_rules ALTER COLUMN id SET DEFAULT nextval('public.wf_approval_rules_id_seq'::regclass);


--
-- Name: wf_cc_task id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_cc_task ALTER COLUMN id SET DEFAULT nextval('public.wf_cc_task_id_seq'::regclass);


--
-- Name: wf_data_source id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_data_source ALTER COLUMN id SET DEFAULT nextval('public.wf_data_source_id_seq'::regclass);


--
-- Name: wf_definition id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_definition ALTER COLUMN id SET DEFAULT nextval('public.wf_definition_id_seq'::regclass);


--
-- Name: wf_definition_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_definition_version ALTER COLUMN id SET DEFAULT nextval('public.wf_definition_version_id_seq'::regclass);


--
-- Name: wf_form_definition id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_form_definition ALTER COLUMN id SET DEFAULT nextval('public.wf_form_definition_id_seq'::regclass);


--
-- Name: wf_form_submission id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_form_submission ALTER COLUMN id SET DEFAULT nextval('public.wf_form_submission_id_seq'::regclass);


--
-- Name: wf_form_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_form_version ALTER COLUMN id SET DEFAULT nextval('public.wf_form_version_id_seq'::regclass);


--
-- Name: wf_instance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_instance ALTER COLUMN id SET DEFAULT nextval('public.wf_instance_id_seq'::regclass);


--
-- Name: wf_instance_variable id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_instance_variable ALTER COLUMN id SET DEFAULT nextval('public.wf_instance_variable_id_seq'::regclass);


--
-- Name: wf_task id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_task ALTER COLUMN id SET DEFAULT nextval('public.wf_task_id_seq'::regclass);


--
-- Name: wf_task_action id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_task_action ALTER COLUMN id SET DEFAULT nextval('public.wf_task_action_id_seq'::regclass);


--
-- Name: wms_outbound id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_outbound ALTER COLUMN id SET DEFAULT nextval('public.wms_outbound_id_seq'::regclass);


--
-- Name: wms_outbound_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_outbound_items ALTER COLUMN id SET DEFAULT nextval('public.wms_outbound_items_id_seq'::regclass);


--
-- Name: wms_stock_balance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_balance ALTER COLUMN id SET DEFAULT nextval('public.wms_stock_balance_id_seq'::regclass);


--
-- Name: wms_stock_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_ledger ALTER COLUMN id SET DEFAULT nextval('public.wms_stock_ledger_id_seq'::regclass);


--
-- Name: wms_stock_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_transfers ALTER COLUMN id SET DEFAULT nextval('public.wms_stock_transfers_id_seq'::regclass);


--
-- Name: wms_stocktake id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stocktake ALTER COLUMN id SET DEFAULT nextval('public.wms_stocktake_id_seq'::regclass);


--
-- Name: wms_transfer id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_transfer ALTER COLUMN id SET DEFAULT nextval('public.wms_transfer_id_seq'::regclass);


--
-- Name: wms_warehouses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_warehouses ALTER COLUMN id SET DEFAULT nextval('public.wms_warehouses_id_seq'::regclass);


--
-- Name: wms_zones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_zones ALTER COLUMN id SET DEFAULT nextval('public.wms_zones_id_seq'::regclass);


--
-- Name: ws_contracts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ws_contracts ALTER COLUMN id SET DEFAULT nextval('public.ws_contracts_id_seq'::regclass);


--
-- Name: ws_shipments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ws_shipments ALTER COLUMN id SET DEFAULT nextval('public.ws_shipments_id_seq'::regclass);


--
-- Name: acc_ledger acc_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_ledger
    ADD CONSTRAINT acc_ledger_pkey PRIMARY KEY (id);


--
-- Name: b2b_customers b2b_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_customers
    ADD CONSTRAINT b2b_customers_pkey PRIMARY KEY (id);


--
-- Name: b2b_order_items b2b_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_order_items
    ADD CONSTRAINT b2b_order_items_pkey PRIMARY KEY (id);


--
-- Name: b2b_orders b2b_orders_order_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_orders
    ADD CONSTRAINT b2b_orders_order_no_key UNIQUE (order_no);


--
-- Name: b2b_orders b2b_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.b2b_orders
    ADD CONSTRAINT b2b_orders_pkey PRIMARY KEY (id);


--
-- Name: biz_cash_flow biz_cash_flow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biz_cash_flow
    ADD CONSTRAINT biz_cash_flow_pkey PRIMARY KEY (id);


--
-- Name: biz_purchase_order biz_purchase_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biz_purchase_order
    ADD CONSTRAINT biz_purchase_order_pkey PRIMARY KEY (id);


--
-- Name: biz_purchase_order biz_purchase_order_po_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biz_purchase_order
    ADD CONSTRAINT biz_purchase_order_po_no_key UNIQUE (po_no);


--
-- Name: biz_sales_order biz_sales_order_order_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biz_sales_order
    ADD CONSTRAINT biz_sales_order_order_no_key UNIQUE (order_no);


--
-- Name: biz_sales_order biz_sales_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biz_sales_order
    ADD CONSTRAINT biz_sales_order_pkey PRIMARY KEY (order_id);


--
-- Name: brd_daily_logs brd_daily_logs_date_house_shift_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_daily_logs
    ADD CONSTRAINT brd_daily_logs_date_house_shift_key UNIQUE (log_date, house_code, shift);


--
-- Name: brd_daily_logs brd_daily_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_daily_logs
    ADD CONSTRAINT brd_daily_logs_pkey PRIMARY KEY (id);


--
-- Name: brd_farms brd_farms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_farms
    ADD CONSTRAINT brd_farms_pkey PRIMARY KEY (farm_code);


--
-- Name: brd_flocks brd_flocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_flocks
    ADD CONSTRAINT brd_flocks_pkey PRIMARY KEY (flock_no);


--
-- Name: brd_houses brd_houses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_houses
    ADD CONSTRAINT brd_houses_pkey PRIMARY KEY (house_code);


--
-- Name: brd_immune_plans brd_immune_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_immune_plans
    ADD CONSTRAINT brd_immune_plans_pkey PRIMARY KEY (id);


--
-- Name: brd_immune_plans brd_immune_plans_plan_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_immune_plans
    ADD CONSTRAINT brd_immune_plans_plan_no_key UNIQUE (plan_no);


--
-- Name: brd_medication_records brd_medication_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_medication_records
    ADD CONSTRAINT brd_medication_records_pkey PRIMARY KEY (id);


--
-- Name: brd_medications brd_medications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_medications
    ADD CONSTRAINT brd_medications_pkey PRIMARY KEY (id);


--
-- Name: brd_vaccinations brd_vaccinations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_vaccinations
    ADD CONSTRAINT brd_vaccinations_pkey PRIMARY KEY (id);


--
-- Name: brd_withdrawal_alerts brd_withdrawal_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brd_withdrawal_alerts
    ADD CONSTRAINT brd_withdrawal_alerts_pkey PRIMARY KEY (id);


--
-- Name: chn_distributor_grading chn_distributor_grading_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chn_distributor_grading
    ADD CONSTRAINT chn_distributor_grading_pkey PRIMARY KEY (id);


--
-- Name: crm_activities crm_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_pkey PRIMARY KEY (id);


--
-- Name: crm_coupons crm_coupons_coupon_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_coupons
    ADD CONSTRAINT crm_coupons_coupon_code_key UNIQUE (coupon_code);


--
-- Name: crm_coupons crm_coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_coupons
    ADD CONSTRAINT crm_coupons_pkey PRIMARY KEY (id);


--
-- Name: crm_levels crm_levels_level_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_levels
    ADD CONSTRAINT crm_levels_level_name_key UNIQUE (level_name);


--
-- Name: crm_levels crm_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_levels
    ADD CONSTRAINT crm_levels_pkey PRIMARY KEY (id);


--
-- Name: crm_members crm_members_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_members
    ADD CONSTRAINT crm_members_member_id_key UNIQUE (member_id);


--
-- Name: crm_members crm_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_members
    ADD CONSTRAINT crm_members_pkey PRIMARY KEY (id);


--
-- Name: crm_points_ledger crm_points_ledger_member_id_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_points_ledger
    ADD CONSTRAINT crm_points_ledger_member_id_period_key UNIQUE (member_id, period);


--
-- Name: crm_points_ledger crm_points_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_points_ledger
    ADD CONSTRAINT crm_points_ledger_pkey PRIMARY KEY (id);


--
-- Name: crm_points_log crm_points_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_points_log
    ADD CONSTRAINT crm_points_log_pkey PRIMARY KEY (id);


--
-- Name: crm_points_rules crm_points_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_points_rules
    ADD CONSTRAINT crm_points_rules_pkey PRIMARY KEY (id);


--
-- Name: cst_credit_warnings cst_credit_warnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cst_credit_warnings
    ADD CONSTRAINT cst_credit_warnings_pkey PRIMARY KEY (id);


--
-- Name: daily_close daily_close_close_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_close
    ADD CONSTRAINT daily_close_close_no_key UNIQUE (close_no);


--
-- Name: daily_close daily_close_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_close
    ADD CONSTRAINT daily_close_pkey PRIMARY KEY (id);


--
-- Name: data_quality_alerts data_quality_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_quality_alerts
    ADD CONSTRAINT data_quality_alerts_pkey PRIMARY KEY (id);


--
-- Name: data_quality_score_snapshots data_quality_score_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_quality_score_snapshots
    ADD CONSTRAINT data_quality_score_snapshots_pkey PRIMARY KEY (id);


--
-- Name: fin_accounts fin_accounts_account_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_accounts
    ADD CONSTRAINT fin_accounts_account_code_key UNIQUE (account_code);


--
-- Name: fin_accounts fin_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_accounts
    ADD CONSTRAINT fin_accounts_pkey PRIMARY KEY (id);


--
-- Name: fin_ap_invoices fin_ap_invoices_ap_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ap_invoices
    ADD CONSTRAINT fin_ap_invoices_ap_no_key UNIQUE (ap_no);


--
-- Name: fin_ap_invoices fin_ap_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ap_invoices
    ADD CONSTRAINT fin_ap_invoices_pkey PRIMARY KEY (id);


--
-- Name: fin_approvals fin_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_approvals
    ADD CONSTRAINT fin_approvals_pkey PRIMARY KEY (id);


--
-- Name: fin_ar_invoices fin_ar_invoices_ar_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ar_invoices
    ADD CONSTRAINT fin_ar_invoices_ar_no_key UNIQUE (ar_no);


--
-- Name: fin_ar_invoices fin_ar_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ar_invoices
    ADD CONSTRAINT fin_ar_invoices_pkey PRIMARY KEY (id);


--
-- Name: fin_ar_receipt_allocations fin_ar_receipt_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ar_receipt_allocations
    ADD CONSTRAINT fin_ar_receipt_allocations_pkey PRIMARY KEY (id);


--
-- Name: fin_ar_receipts fin_ar_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ar_receipts
    ADD CONSTRAINT fin_ar_receipts_pkey PRIMARY KEY (id);


--
-- Name: fin_ar_receipts fin_ar_receipts_receipt_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_ar_receipts
    ADD CONSTRAINT fin_ar_receipts_receipt_no_key UNIQUE (receipt_no);


--
-- Name: fin_bank_accounts fin_bank_accounts_bank_account_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_bank_accounts
    ADD CONSTRAINT fin_bank_accounts_bank_account_code_key UNIQUE (bank_account_code);


--
-- Name: fin_bank_accounts fin_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_bank_accounts
    ADD CONSTRAINT fin_bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: fin_cash_accounts fin_cash_accounts_account_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_cash_accounts
    ADD CONSTRAINT fin_cash_accounts_account_code_key UNIQUE (account_code);


--
-- Name: fin_cash_accounts fin_cash_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_cash_accounts
    ADD CONSTRAINT fin_cash_accounts_pkey PRIMARY KEY (id);


--
-- Name: fin_cash_transactions fin_cash_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_cash_transactions
    ADD CONSTRAINT fin_cash_transactions_pkey PRIMARY KEY (id);


--
-- Name: fin_cash_transactions fin_cash_transactions_txn_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_cash_transactions
    ADD CONSTRAINT fin_cash_transactions_txn_no_key UNIQUE (txn_no);


--
-- Name: fin_exchange_rates fin_exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_exchange_rates
    ADD CONSTRAINT fin_exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: fin_expense_requests fin_expense_requests_expense_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_expense_requests
    ADD CONSTRAINT fin_expense_requests_expense_no_key UNIQUE (expense_no);


--
-- Name: fin_expense_requests fin_expense_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_expense_requests
    ADD CONSTRAINT fin_expense_requests_pkey PRIMARY KEY (id);


--
-- Name: fin_fund_transfers fin_fund_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_fund_transfers
    ADD CONSTRAINT fin_fund_transfers_pkey PRIMARY KEY (id);


--
-- Name: fin_fund_transfers fin_fund_transfers_transfer_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_fund_transfers
    ADD CONSTRAINT fin_fund_transfers_transfer_no_key UNIQUE (transfer_no);


--
-- Name: fin_invoices fin_invoices_invoice_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_invoices
    ADD CONSTRAINT fin_invoices_invoice_no_key UNIQUE (invoice_no);


--
-- Name: fin_invoices fin_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_invoices
    ADD CONSTRAINT fin_invoices_pkey PRIMARY KEY (id);


--
-- Name: fin_pay_records fin_pay_records_pay_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_pay_records
    ADD CONSTRAINT fin_pay_records_pay_no_key UNIQUE (pay_no);


--
-- Name: fin_pay_records fin_pay_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_pay_records
    ADD CONSTRAINT fin_pay_records_pkey PRIMARY KEY (id);


--
-- Name: fin_payments fin_payments_payment_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_payments
    ADD CONSTRAINT fin_payments_payment_no_key UNIQUE (payment_no);


--
-- Name: fin_payments fin_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_payments
    ADD CONSTRAINT fin_payments_pkey PRIMARY KEY (id);


--
-- Name: fin_reimbursements fin_reimbursements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_reimbursements
    ADD CONSTRAINT fin_reimbursements_pkey PRIMARY KEY (id);


--
-- Name: fin_reimbursements fin_reimbursements_reimb_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_reimbursements
    ADD CONSTRAINT fin_reimbursements_reimb_no_key UNIQUE (reimb_no);


--
-- Name: fin_shareholder_contributions fin_shareholder_contributions_contribution_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_shareholder_contributions
    ADD CONSTRAINT fin_shareholder_contributions_contribution_no_key UNIQUE (contribution_no);


--
-- Name: fin_shareholder_contributions fin_shareholder_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_shareholder_contributions
    ADD CONSTRAINT fin_shareholder_contributions_pkey PRIMARY KEY (id);


--
-- Name: fin_shareholder_settlements fin_shareholder_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_shareholder_settlements
    ADD CONSTRAINT fin_shareholder_settlements_pkey PRIMARY KEY (id);


--
-- Name: fin_shareholder_settlements fin_shareholder_settlements_settlement_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_shareholder_settlements
    ADD CONSTRAINT fin_shareholder_settlements_settlement_no_key UNIQUE (settlement_no);


--
-- Name: fin_store_settlements fin_store_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_store_settlements
    ADD CONSTRAINT fin_store_settlements_pkey PRIMARY KEY (id);


--
-- Name: fin_store_settlements fin_store_settlements_settle_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_store_settlements
    ADD CONSTRAINT fin_store_settlements_settle_no_key UNIQUE (settle_no);


--
-- Name: fin_transactions fin_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_transactions
    ADD CONSTRAINT fin_transactions_pkey PRIMARY KEY (id);


--
-- Name: inv_batches inv_batches_batch_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_batches
    ADD CONSTRAINT inv_batches_batch_no_key UNIQUE (batch_no);


--
-- Name: inv_batches inv_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_batches
    ADD CONSTRAINT inv_batches_pkey PRIMARY KEY (id);


--
-- Name: inv_ledger inv_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_ledger
    ADD CONSTRAINT inv_ledger_pkey PRIMARY KEY (id);


--
-- Name: inv_source_mode_audit inv_source_mode_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_source_mode_audit
    ADD CONSTRAINT inv_source_mode_audit_pkey PRIMARY KEY (id);


--
-- Name: inv_source_mode inv_source_mode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_source_mode
    ADD CONSTRAINT inv_source_mode_pkey PRIMARY KEY (id);


--
-- Name: lbl_records lbl_records_label_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lbl_records
    ADD CONSTRAINT lbl_records_label_no_key UNIQUE (label_no);


--
-- Name: lbl_records lbl_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lbl_records
    ADD CONSTRAINT lbl_records_pkey PRIMARY KEY (id);


--
-- Name: log_dispatch log_dispatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_dispatch
    ADD CONSTRAINT log_dispatch_pkey PRIMARY KEY (dispatch_no);


--
-- Name: log_drivers log_drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_drivers
    ADD CONSTRAINT log_drivers_pkey PRIMARY KEY (driver_id);


--
-- Name: log_exceptions log_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_exceptions
    ADD CONSTRAINT log_exceptions_pkey PRIMARY KEY (id);


--
-- Name: log_receipts log_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_receipts
    ADD CONSTRAINT log_receipts_pkey PRIMARY KEY (id);


--
-- Name: log_routes log_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_routes
    ADD CONSTRAINT log_routes_pkey PRIMARY KEY (route_code);


--
-- Name: log_vehicles log_vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.log_vehicles
    ADD CONSTRAINT log_vehicles_pkey PRIMARY KEY (plate_no);


--
-- Name: md_governance_events md_governance_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.md_governance_events
    ADD CONSTRAINT md_governance_events_pkey PRIMARY KEY (id);


--
-- Name: md_governance_snapshots md_governance_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.md_governance_snapshots
    ADD CONSTRAINT md_governance_snapshots_pkey PRIMARY KEY (id);


--
-- Name: mon_device_alert_event mon_device_alert_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_device_alert_event
    ADD CONSTRAINT mon_device_alert_event_pkey PRIMARY KEY (id);


--
-- Name: mon_device_property_daily_agg mon_device_property_daily_agg_erp_house_code_property_code__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_device_property_daily_agg
    ADD CONSTRAINT mon_device_property_daily_agg_erp_house_code_property_code__key UNIQUE (erp_house_code, property_code, agg_date);


--
-- Name: mon_device_property_daily_agg mon_device_property_daily_agg_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_device_property_daily_agg
    ADD CONSTRAINT mon_device_property_daily_agg_pkey PRIMARY KEY (id);


--
-- Name: mon_device_property_dict mon_device_property_dict_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_device_property_dict
    ADD CONSTRAINT mon_device_property_dict_pkey PRIMARY KEY (id);


--
-- Name: mon_device_property_dict mon_device_property_dict_property_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_device_property_dict
    ADD CONSTRAINT mon_device_property_dict_property_code_key UNIQUE (property_code);


--
-- Name: mon_device_property_history mon_device_property_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_device_property_history
    ADD CONSTRAINT mon_device_property_history_pkey PRIMARY KEY (id);


--
-- Name: mon_device_realtime_snapshot mon_device_realtime_snapshot_erp_house_code_property_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_device_realtime_snapshot
    ADD CONSTRAINT mon_device_realtime_snapshot_erp_house_code_property_code_key UNIQUE (erp_house_code, property_code);


--
-- Name: mon_device_realtime_snapshot mon_device_realtime_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_device_realtime_snapshot
    ADD CONSTRAINT mon_device_realtime_snapshot_pkey PRIMARY KEY (id);


--
-- Name: mon_house_device_mapping mon_house_device_mapping_erp_house_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_house_device_mapping
    ADD CONSTRAINT mon_house_device_mapping_erp_house_code_key UNIQUE (erp_house_code);


--
-- Name: mon_house_device_mapping mon_house_device_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_house_device_mapping
    ADD CONSTRAINT mon_house_device_mapping_pkey PRIMARY KEY (id);


--
-- Name: mst_account_holders mst_account_holders_holder_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_account_holders
    ADD CONSTRAINT mst_account_holders_holder_code_key UNIQUE (holder_code);


--
-- Name: mst_account_holders mst_account_holders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_account_holders
    ADD CONSTRAINT mst_account_holders_pkey PRIMARY KEY (id);


--
-- Name: mst_audit_trail mst_audit_trail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_audit_trail
    ADD CONSTRAINT mst_audit_trail_pkey PRIMARY KEY (id);


--
-- Name: mst_bank_accounts mst_bank_accounts_bank_acc_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_bank_accounts
    ADD CONSTRAINT mst_bank_accounts_bank_acc_code_key UNIQUE (bank_acc_code);


--
-- Name: mst_bank_accounts mst_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_bank_accounts
    ADD CONSTRAINT mst_bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: mst_code_seq mst_code_seq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_code_seq
    ADD CONSTRAINT mst_code_seq_pkey PRIMARY KEY (prefix);


--
-- Name: mst_merge_log mst_merge_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_merge_log
    ADD CONSTRAINT mst_merge_log_pkey PRIMARY KEY (id);


--
-- Name: mst_products mst_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_products
    ADD CONSTRAINT mst_products_pkey PRIMARY KEY (id);


--
-- Name: mst_products mst_products_product_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_products
    ADD CONSTRAINT mst_products_product_code_key UNIQUE (product_code);


--
-- Name: mst_stores mst_stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_stores
    ADD CONSTRAINT mst_stores_pkey PRIMARY KEY (id);


--
-- Name: mst_stores mst_stores_store_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mst_stores
    ADD CONSTRAINT mst_stores_store_code_key UNIQUE (store_code);


--
-- Name: ord_approval_log ord_approval_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_approval_log
    ADD CONSTRAINT ord_approval_log_pkey PRIMARY KEY (id);


--
-- Name: ord_credit_usage ord_credit_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_credit_usage
    ADD CONSTRAINT ord_credit_usage_pkey PRIMARY KEY (id);


--
-- Name: ord_customers ord_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_customers
    ADD CONSTRAINT ord_customers_pkey PRIMARY KEY (id);


--
-- Name: ord_order_items ord_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_order_items
    ADD CONSTRAINT ord_order_items_pkey PRIMARY KEY (id);


--
-- Name: ord_orders ord_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_orders
    ADD CONSTRAINT ord_orders_pkey PRIMARY KEY (id);


--
-- Name: ord_prices ord_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ord_prices
    ADD CONSTRAINT ord_prices_pkey PRIMARY KEY (id);


--
-- Name: packaging_specs packaging_specs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packaging_specs
    ADD CONSTRAINT packaging_specs_pkey PRIMARY KEY (id);


--
-- Name: packaging_specs packaging_specs_spec_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packaging_specs
    ADD CONSTRAINT packaging_specs_spec_code_key UNIQUE (spec_code);


--
-- Name: pda_app_info pda_app_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_app_info
    ADD CONSTRAINT pda_app_info_pkey PRIMARY KEY (id);


--
-- Name: pda_sync_log pda_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_sync_log
    ADD CONSTRAINT pda_sync_log_pkey PRIMARY KEY (id);


--
-- Name: pda_system_config pda_system_config_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_system_config
    ADD CONSTRAINT pda_system_config_config_key_key UNIQUE (config_key);


--
-- Name: pda_system_config pda_system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_system_config
    ADD CONSTRAINT pda_system_config_pkey PRIMARY KEY (id);


--
-- Name: pda_terminals pda_terminals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pda_terminals
    ADD CONSTRAINT pda_terminals_pkey PRIMARY KEY (id);


--
-- Name: pilot_daily_reports pilot_daily_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_daily_reports
    ADD CONSTRAINT pilot_daily_reports_pkey PRIMARY KEY (id);


--
-- Name: pkg_audit_logs pkg_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_audit_logs
    ADD CONSTRAINT pkg_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: pkg_exceptions pkg_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_exceptions
    ADD CONSTRAINT pkg_exceptions_pkey PRIMARY KEY (id);


--
-- Name: pkg_grading_records pkg_grading_records_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_grading_records
    ADD CONSTRAINT pkg_grading_records_code_key UNIQUE (code);


--
-- Name: pkg_grading_records pkg_grading_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_grading_records
    ADD CONSTRAINT pkg_grading_records_pkey PRIMARY KEY (id);


--
-- Name: pkg_handover_records pkg_handover_records_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_handover_records
    ADD CONSTRAINT pkg_handover_records_code_key UNIQUE (code);


--
-- Name: pkg_handover_records pkg_handover_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_handover_records
    ADD CONSTRAINT pkg_handover_records_pkey PRIMARY KEY (id);


--
-- Name: pkg_label_print_logs pkg_label_print_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_label_print_logs
    ADD CONSTRAINT pkg_label_print_logs_pkey PRIMARY KEY (id);


--
-- Name: pkg_packing_records pkg_packing_records_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_packing_records
    ADD CONSTRAINT pkg_packing_records_code_key UNIQUE (code);


--
-- Name: pkg_packing_records pkg_packing_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_packing_records
    ADD CONSTRAINT pkg_packing_records_pkey PRIMARY KEY (id);


--
-- Name: pkg_qc_inspections pkg_qc_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_qc_inspections
    ADD CONSTRAINT pkg_qc_inspections_pkey PRIMARY KEY (id);


--
-- Name: pkg_shifts pkg_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_shifts
    ADD CONSTRAINT pkg_shifts_pkey PRIMARY KEY (id);


--
-- Name: pkg_shifts pkg_shifts_shift_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_shifts
    ADD CONSTRAINT pkg_shifts_shift_no_key UNIQUE (shift_no);


--
-- Name: pkg_source_batches pkg_source_batches_batch_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_source_batches
    ADD CONSTRAINT pkg_source_batches_batch_code_key UNIQUE (batch_code);


--
-- Name: pkg_source_batches pkg_source_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_source_batches
    ADD CONSTRAINT pkg_source_batches_pkey PRIMARY KEY (id);


--
-- Name: pkg_tasks pkg_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_tasks
    ADD CONSTRAINT pkg_tasks_pkey PRIMARY KEY (id);


--
-- Name: pkg_tasks pkg_tasks_task_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_tasks
    ADD CONSTRAINT pkg_tasks_task_no_key UNIQUE (task_no);


--
-- Name: pkg_work_shifts pkg_work_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_work_shifts
    ADD CONSTRAINT pkg_work_shifts_pkey PRIMARY KEY (id);


--
-- Name: pkg_work_shifts pkg_work_shifts_shift_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pkg_work_shifts
    ADD CONSTRAINT pkg_work_shifts_shift_code_key UNIQUE (shift_code);


--
-- Name: pos_refunds pos_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_refunds
    ADD CONSTRAINT pos_refunds_pkey PRIMARY KEY (id);


--
-- Name: pos_refunds pos_refunds_refund_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_refunds
    ADD CONSTRAINT pos_refunds_refund_no_key UNIQUE (refund_no);


--
-- Name: pos_sale_items pos_sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sale_items
    ADD CONSTRAINT pos_sale_items_pkey PRIMARY KEY (id);


--
-- Name: pos_sales pos_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sales
    ADD CONSTRAINT pos_sales_pkey PRIMARY KEY (id);


--
-- Name: pos_sales pos_sales_sale_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sales
    ADD CONSTRAINT pos_sales_sale_no_key UNIQUE (sale_no);


--
-- Name: pos_sessions pos_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_pkey PRIMARY KEY (id);


--
-- Name: pos_sessions pos_sessions_session_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_session_no_key UNIQUE (session_no);


--
-- Name: prc2_ap_ledger prc2_ap_ledger_ap_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_ap_ledger
    ADD CONSTRAINT prc2_ap_ledger_ap_no_key UNIQUE (ap_no);


--
-- Name: prc2_ap_ledger prc2_ap_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_ap_ledger
    ADD CONSTRAINT prc2_ap_ledger_pkey PRIMARY KEY (id);


--
-- Name: prc2_ap_ledger prc2_ap_ledger_po_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_ap_ledger
    ADD CONSTRAINT prc2_ap_ledger_po_id_key UNIQUE (po_id);


--
-- Name: prc2_approvals prc2_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_approvals
    ADD CONSTRAINT prc2_approvals_pkey PRIMARY KEY (id);


--
-- Name: prc2_init_batch_rows prc2_init_batch_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_init_batch_rows
    ADD CONSTRAINT prc2_init_batch_rows_pkey PRIMARY KEY (id);


--
-- Name: prc2_init_batches prc2_init_batches_batch_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_init_batches
    ADD CONSTRAINT prc2_init_batches_batch_no_key UNIQUE (batch_no);


--
-- Name: prc2_init_batches prc2_init_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_init_batches
    ADD CONSTRAINT prc2_init_batches_pkey PRIMARY KEY (id);


--
-- Name: prc2_order_items prc2_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_order_items
    ADD CONSTRAINT prc2_order_items_pkey PRIMARY KEY (id);


--
-- Name: prc2_payment_allocations prc2_payment_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_payment_allocations
    ADD CONSTRAINT prc2_payment_allocations_pkey PRIMARY KEY (id);


--
-- Name: prc2_payments prc2_payments_pay_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_payments
    ADD CONSTRAINT prc2_payments_pay_no_key UNIQUE (pay_no);


--
-- Name: prc2_payments prc2_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_payments
    ADD CONSTRAINT prc2_payments_pkey PRIMARY KEY (id);


--
-- Name: prc2_projects prc2_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_projects
    ADD CONSTRAINT prc2_projects_pkey PRIMARY KEY (id);


--
-- Name: prc2_purchase_orders prc2_purchase_orders_contract_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_purchase_orders
    ADD CONSTRAINT prc2_purchase_orders_contract_no_key UNIQUE (contract_no);


--
-- Name: prc2_purchase_orders prc2_purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_purchase_orders
    ADD CONSTRAINT prc2_purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: prc2_purchase_orders prc2_purchase_orders_po_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_purchase_orders
    ADD CONSTRAINT prc2_purchase_orders_po_no_key UNIQUE (po_no);


--
-- Name: prc2_purchase_requests prc2_purchase_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_purchase_requests
    ADD CONSTRAINT prc2_purchase_requests_pkey PRIMARY KEY (id);


--
-- Name: prc2_purchase_requests prc2_purchase_requests_req_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_purchase_requests
    ADD CONSTRAINT prc2_purchase_requests_req_no_key UNIQUE (req_no);


--
-- Name: prc2_receipt_items prc2_receipt_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_receipt_items
    ADD CONSTRAINT prc2_receipt_items_pkey PRIMARY KEY (id);


--
-- Name: prc2_receipts prc2_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_receipts
    ADD CONSTRAINT prc2_receipts_pkey PRIMARY KEY (id);


--
-- Name: prc2_receipts prc2_receipts_receipt_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_receipts
    ADD CONSTRAINT prc2_receipts_receipt_no_key UNIQUE (receipt_no);


--
-- Name: prc2_request_items prc2_request_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_request_items
    ADD CONSTRAINT prc2_request_items_pkey PRIMARY KEY (id);


--
-- Name: prc2_shareholder_funds prc2_shareholder_funds_fund_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_shareholder_funds
    ADD CONSTRAINT prc2_shareholder_funds_fund_no_key UNIQUE (fund_no);


--
-- Name: prc2_shareholder_funds prc2_shareholder_funds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_shareholder_funds
    ADD CONSTRAINT prc2_shareholder_funds_pkey PRIMARY KEY (id);


--
-- Name: prc2_shipments prc2_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_shipments
    ADD CONSTRAINT prc2_shipments_pkey PRIMARY KEY (id);


--
-- Name: prc2_shipments prc2_shipments_shipment_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_shipments
    ADD CONSTRAINT prc2_shipments_shipment_no_key UNIQUE (shipment_no);


--
-- Name: prc2_suppliers prc2_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_suppliers
    ADD CONSTRAINT prc2_suppliers_pkey PRIMARY KEY (id);


--
-- Name: prc2_suppliers prc2_suppliers_supplier_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_suppliers
    ADD CONSTRAINT prc2_suppliers_supplier_code_key UNIQUE (supplier_code);


--
-- Name: prc_price_books prc_price_books_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_price_books
    ADD CONSTRAINT prc_price_books_pkey PRIMARY KEY (id);


--
-- Name: prc_price_books prc_price_books_price_book_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_price_books
    ADD CONSTRAINT prc_price_books_price_book_id_key UNIQUE (price_book_id);


--
-- Name: prc_price_items prc_price_items_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_price_items
    ADD CONSTRAINT prc_price_items_item_id_key UNIQUE (item_id);


--
-- Name: prc_price_items prc_price_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_price_items
    ADD CONSTRAINT prc_price_items_pkey PRIMARY KEY (id);


--
-- Name: prc_purchase_items prc_purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_items
    ADD CONSTRAINT prc_purchase_items_pkey PRIMARY KEY (id);


--
-- Name: prc_purchase_orders prc_purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_orders
    ADD CONSTRAINT prc_purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: prc_purchase_orders prc_purchase_orders_po_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_orders
    ADD CONSTRAINT prc_purchase_orders_po_no_key UNIQUE (po_no);


--
-- Name: prc_purchase_payments prc_purchase_payments_payment_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_payments
    ADD CONSTRAINT prc_purchase_payments_payment_no_key UNIQUE (payment_no);


--
-- Name: prc_purchase_payments prc_purchase_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_payments
    ADD CONSTRAINT prc_purchase_payments_pkey PRIMARY KEY (id);


--
-- Name: prc_purchase_requests prc_purchase_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_requests
    ADD CONSTRAINT prc_purchase_requests_pkey PRIMARY KEY (id);


--
-- Name: prc_purchase_requests prc_purchase_requests_req_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_purchase_requests
    ADD CONSTRAINT prc_purchase_requests_req_no_key UNIQUE (req_no);


--
-- Name: prc_receipts prc_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_receipts
    ADD CONSTRAINT prc_receipts_pkey PRIMARY KEY (id);


--
-- Name: prc_receipts prc_receipts_receipt_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_receipts
    ADD CONSTRAINT prc_receipts_receipt_no_key UNIQUE (receipt_no);


--
-- Name: prc_returns prc_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_returns
    ADD CONSTRAINT prc_returns_pkey PRIMARY KEY (id);


--
-- Name: prc_returns prc_returns_return_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_returns
    ADD CONSTRAINT prc_returns_return_no_key UNIQUE (return_no);


--
-- Name: prc_supplier_returns prc_supplier_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_supplier_returns
    ADD CONSTRAINT prc_supplier_returns_pkey PRIMARY KEY (id);


--
-- Name: prc_supplier_returns prc_supplier_returns_return_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_supplier_returns
    ADD CONSTRAINT prc_supplier_returns_return_no_key UNIQUE (return_no);


--
-- Name: prc_suppliers prc_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_suppliers
    ADD CONSTRAINT prc_suppliers_pkey PRIMARY KEY (id);


--
-- Name: prc_suppliers prc_suppliers_supplier_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc_suppliers
    ADD CONSTRAINT prc_suppliers_supplier_code_key UNIQUE (supplier_code);


--
-- Name: product_grades product_grades_grade_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_grades
    ADD CONSTRAINT product_grades_grade_code_key UNIQUE (grade_code);


--
-- Name: product_grades product_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_grades
    ADD CONSTRAINT product_grades_pkey PRIMARY KEY (id);


--
-- Name: product_master product_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_master
    ADD CONSTRAINT product_master_pkey PRIMARY KEY (id);


--
-- Name: product_master product_master_product_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_master
    ADD CONSTRAINT product_master_product_code_key UNIQUE (product_code);


--
-- Name: product_skus product_skus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_skus
    ADD CONSTRAINT product_skus_pkey PRIMARY KEY (id);


--
-- Name: product_skus product_skus_sku_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_skus
    ADD CONSTRAINT product_skus_sku_code_key UNIQUE (sku_code);


--
-- Name: qa_inspection_items qa_inspection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_inspection_items
    ADD CONSTRAINT qa_inspection_items_pkey PRIMARY KEY (id);


--
-- Name: qa_inspections qa_inspections_inspect_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_inspections
    ADD CONSTRAINT qa_inspections_inspect_no_key UNIQUE (inspect_no);


--
-- Name: qa_inspections qa_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_inspections
    ADD CONSTRAINT qa_inspections_pkey PRIMARY KEY (id);


--
-- Name: qa_non_conformance qa_non_conformance_ncr_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_non_conformance
    ADD CONSTRAINT qa_non_conformance_ncr_no_key UNIQUE (ncr_no);


--
-- Name: qa_non_conformance qa_non_conformance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_non_conformance
    ADD CONSTRAINT qa_non_conformance_pkey PRIMARY KEY (id);


--
-- Name: qa_product_inspections qa_product_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_product_inspections
    ADD CONSTRAINT qa_product_inspections_pkey PRIMARY KEY (id);


--
-- Name: qa_standards_history qa_standards_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_standards_history
    ADD CONSTRAINT qa_standards_history_pkey PRIMARY KEY (id);


--
-- Name: qa_standards qa_standards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_standards
    ADD CONSTRAINT qa_standards_pkey PRIMARY KEY (id);


--
-- Name: qa_standards qa_standards_std_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qa_standards
    ADD CONSTRAINT qa_standards_std_code_key UNIQUE (std_code);


--
-- Name: sal_channels sal_channels_channel_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_channels
    ADD CONSTRAINT sal_channels_channel_code_key UNIQUE (channel_code);


--
-- Name: sal_channels sal_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_channels
    ADD CONSTRAINT sal_channels_pkey PRIMARY KEY (id);


--
-- Name: sal_customers sal_customers_customer_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_customers
    ADD CONSTRAINT sal_customers_customer_no_key UNIQUE (customer_no);


--
-- Name: sal_customers sal_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_customers
    ADD CONSTRAINT sal_customers_pkey PRIMARY KEY (id);


--
-- Name: sal_delivery_order_items sal_delivery_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_delivery_order_items
    ADD CONSTRAINT sal_delivery_order_items_pkey PRIMARY KEY (id);


--
-- Name: sal_delivery_orders sal_delivery_orders_delivery_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_delivery_orders
    ADD CONSTRAINT sal_delivery_orders_delivery_no_key UNIQUE (delivery_no);


--
-- Name: sal_delivery_orders sal_delivery_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_delivery_orders
    ADD CONSTRAINT sal_delivery_orders_pkey PRIMARY KEY (id);


--
-- Name: sal_drivers sal_drivers_driver_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_drivers
    ADD CONSTRAINT sal_drivers_driver_code_key UNIQUE (driver_code);


--
-- Name: sal_drivers sal_drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_drivers
    ADD CONSTRAINT sal_drivers_pkey PRIMARY KEY (id);


--
-- Name: sal_order_items sal_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_order_items
    ADD CONSTRAINT sal_order_items_pkey PRIMARY KEY (id);


--
-- Name: sal_price_books sal_price_books_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_price_books
    ADD CONSTRAINT sal_price_books_pkey PRIMARY KEY (id);


--
-- Name: sal_price_books sal_price_books_price_book_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_price_books
    ADD CONSTRAINT sal_price_books_price_book_no_key UNIQUE (price_book_no);


--
-- Name: sal_price_items sal_price_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_price_items
    ADD CONSTRAINT sal_price_items_pkey PRIMARY KEY (id);


--
-- Name: sal_receipts sal_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_receipts
    ADD CONSTRAINT sal_receipts_pkey PRIMARY KEY (id);


--
-- Name: sal_receipts sal_receipts_receipt_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_receipts
    ADD CONSTRAINT sal_receipts_receipt_no_key UNIQUE (receipt_no);


--
-- Name: sal_return_items sal_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_return_items
    ADD CONSTRAINT sal_return_items_pkey PRIMARY KEY (id);


--
-- Name: sal_return_orders sal_return_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_return_orders
    ADD CONSTRAINT sal_return_orders_pkey PRIMARY KEY (id);


--
-- Name: sal_return_orders sal_return_orders_return_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_return_orders
    ADD CONSTRAINT sal_return_orders_return_no_key UNIQUE (return_no);


--
-- Name: sal_sales_orders sal_sales_orders_order_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_sales_orders
    ADD CONSTRAINT sal_sales_orders_order_no_key UNIQUE (order_no);


--
-- Name: sal_sales_orders sal_sales_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_sales_orders
    ADD CONSTRAINT sal_sales_orders_pkey PRIMARY KEY (id);


--
-- Name: sal_store_sale_items sal_store_sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_store_sale_items
    ADD CONSTRAINT sal_store_sale_items_pkey PRIMARY KEY (id);


--
-- Name: sal_store_sales sal_store_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_store_sales
    ADD CONSTRAINT sal_store_sales_pkey PRIMARY KEY (id);


--
-- Name: sal_store_sales sal_store_sales_sale_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_store_sales
    ADD CONSTRAINT sal_store_sales_sale_no_key UNIQUE (sale_no);


--
-- Name: sal_store_shift_closings sal_store_shift_closings_closing_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_store_shift_closings
    ADD CONSTRAINT sal_store_shift_closings_closing_no_key UNIQUE (closing_no);


--
-- Name: sal_store_shift_closings sal_store_shift_closings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_store_shift_closings
    ADD CONSTRAINT sal_store_shift_closings_pkey PRIMARY KEY (id);


--
-- Name: sal_vehicles sal_vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_vehicles
    ADD CONSTRAINT sal_vehicles_pkey PRIMARY KEY (id);


--
-- Name: sal_vehicles sal_vehicles_vehicle_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_vehicles
    ADD CONSTRAINT sal_vehicles_vehicle_no_key UNIQUE (vehicle_no);


--
-- Name: shr_beneficial_equity shr_beneficial_equity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_beneficial_equity
    ADD CONSTRAINT shr_beneficial_equity_pkey PRIMARY KEY (id);


--
-- Name: shr_beneficial_equity shr_beneficial_equity_project_code_nominee_shareholder_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_beneficial_equity
    ADD CONSTRAINT shr_beneficial_equity_project_code_nominee_shareholder_code_key UNIQUE (project_code, nominee_shareholder_code, beneficial_shareholder_code);


--
-- Name: shr_capital_contributions shr_capital_contributions_contribution_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_capital_contributions
    ADD CONSTRAINT shr_capital_contributions_contribution_no_key UNIQUE (contribution_no);


--
-- Name: shr_capital_contributions shr_capital_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_capital_contributions
    ADD CONSTRAINT shr_capital_contributions_pkey PRIMARY KEY (id);


--
-- Name: shr_project_equity shr_project_equity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_project_equity
    ADD CONSTRAINT shr_project_equity_pkey PRIMARY KEY (id);


--
-- Name: shr_project_equity shr_project_equity_project_code_shareholder_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_project_equity
    ADD CONSTRAINT shr_project_equity_project_code_shareholder_code_key UNIQUE (project_code, shareholder_code);


--
-- Name: shr_projects shr_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_projects
    ADD CONSTRAINT shr_projects_pkey PRIMARY KEY (id);


--
-- Name: shr_projects shr_projects_project_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_projects
    ADD CONSTRAINT shr_projects_project_code_key UNIQUE (project_code);


--
-- Name: shr_shareholder_scopes shr_shareholder_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_shareholder_scopes
    ADD CONSTRAINT shr_shareholder_scopes_pkey PRIMARY KEY (id);


--
-- Name: shr_shareholders shr_shareholders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_shareholders
    ADD CONSTRAINT shr_shareholders_pkey PRIMARY KEY (id);


--
-- Name: shr_shareholders shr_shareholders_shareholder_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shr_shareholders
    ADD CONSTRAINT shr_shareholders_shareholder_code_key UNIQUE (shareholder_code);


--
-- Name: store_inventory store_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_inventory
    ADD CONSTRAINT store_inventory_pkey PRIMARY KEY (id);


--
-- Name: store_inventory store_inventory_store_code_product_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_inventory
    ADD CONSTRAINT store_inventory_store_code_product_code_key UNIQUE (store_code, product_code);


--
-- Name: store_losses store_losses_loss_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_losses
    ADD CONSTRAINT store_losses_loss_no_key UNIQUE (loss_no);


--
-- Name: store_losses store_losses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_losses
    ADD CONSTRAINT store_losses_pkey PRIMARY KEY (id);


--
-- Name: store_receiving_items store_receiving_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_receiving_items
    ADD CONSTRAINT store_receiving_items_pkey PRIMARY KEY (id);


--
-- Name: store_receiving store_receiving_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_receiving
    ADD CONSTRAINT store_receiving_pkey PRIMARY KEY (id);


--
-- Name: store_receiving store_receiving_receiving_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_receiving
    ADD CONSTRAINT store_receiving_receiving_no_key UNIQUE (receiving_no);


--
-- Name: store_replenish_req store_replenish_req_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_replenish_req
    ADD CONSTRAINT store_replenish_req_pkey PRIMARY KEY (id);


--
-- Name: store_replenish_req store_replenish_req_req_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_replenish_req
    ADD CONSTRAINT store_replenish_req_req_no_key UNIQUE (req_no);


--
-- Name: store_transfers store_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_transfers
    ADD CONSTRAINT store_transfers_pkey PRIMARY KEY (id);


--
-- Name: store_transfers store_transfers_transfer_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_transfers
    ADD CONSTRAINT store_transfers_transfer_no_key UNIQUE (transfer_no);


--
-- Name: sys_alerts sys_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_alerts
    ADD CONSTRAINT sys_alerts_pkey PRIMARY KEY (id);


--
-- Name: sys_approval_flows sys_approval_flows_flow_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_approval_flows
    ADD CONSTRAINT sys_approval_flows_flow_code_key UNIQUE (flow_code);


--
-- Name: sys_approval_flows sys_approval_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_approval_flows
    ADD CONSTRAINT sys_approval_flows_pkey PRIMARY KEY (id);


--
-- Name: sys_approval_log sys_approval_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_approval_log
    ADD CONSTRAINT sys_approval_log_pkey PRIMARY KEY (id);


--
-- Name: sys_approval_rule sys_approval_rule_doc_type_amount_min_currency_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_approval_rule
    ADD CONSTRAINT sys_approval_rule_doc_type_amount_min_currency_code_key UNIQUE (doc_type, amount_min, currency_code);


--
-- Name: sys_approval_rule sys_approval_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_approval_rule
    ADD CONSTRAINT sys_approval_rule_pkey PRIMARY KEY (rule_id);


--
-- Name: sys_audit_log sys_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_audit_log
    ADD CONSTRAINT sys_audit_log_pkey PRIMARY KEY (log_id);


--
-- Name: sys_configs sys_configs_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_configs
    ADD CONSTRAINT sys_configs_config_key_key UNIQUE (config_key);


--
-- Name: sys_configs sys_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_configs
    ADD CONSTRAINT sys_configs_pkey PRIMARY KEY (id);


--
-- Name: sys_data_scopes sys_data_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_data_scopes
    ADD CONSTRAINT sys_data_scopes_pkey PRIMARY KEY (id);


--
-- Name: sys_dict sys_dict_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_dict
    ADD CONSTRAINT sys_dict_pkey PRIMARY KEY (id);


--
-- Name: sys_doc_state_lock sys_doc_state_lock_doc_type_locked_state_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_doc_state_lock
    ADD CONSTRAINT sys_doc_state_lock_doc_type_locked_state_key UNIQUE (doc_type, locked_state);


--
-- Name: sys_doc_state_lock sys_doc_state_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_doc_state_lock
    ADD CONSTRAINT sys_doc_state_lock_pkey PRIMARY KEY (lock_id);


--
-- Name: sys_error_logs sys_error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_error_logs
    ADD CONSTRAINT sys_error_logs_pkey PRIMARY KEY (id);


--
-- Name: sys_exchange_rates sys_exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_exchange_rates
    ADD CONSTRAINT sys_exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: sys_menu sys_menu_menu_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_menu
    ADD CONSTRAINT sys_menu_menu_code_key UNIQUE (menu_code);


--
-- Name: sys_menu sys_menu_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_menu
    ADD CONSTRAINT sys_menu_pkey PRIMARY KEY (menu_id);


--
-- Name: sys_notifications sys_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_notifications
    ADD CONSTRAINT sys_notifications_pkey PRIMARY KEY (id);


--
-- Name: sys_operation_logs sys_operation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_operation_logs
    ADD CONSTRAINT sys_operation_logs_pkey PRIMARY KEY (id);


--
-- Name: sys_organizations sys_organizations_org_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_organizations
    ADD CONSTRAINT sys_organizations_org_code_key UNIQUE (org_code);


--
-- Name: sys_organizations sys_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_organizations
    ADD CONSTRAINT sys_organizations_pkey PRIMARY KEY (id);


--
-- Name: sys_permission_set_item sys_permission_set_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permission_set_item
    ADD CONSTRAINT sys_permission_set_item_pkey PRIMARY KEY (item_id);


--
-- Name: sys_permission_set_item sys_permission_set_item_set_id_menu_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permission_set_item
    ADD CONSTRAINT sys_permission_set_item_set_id_menu_id_key UNIQUE (set_id, menu_id);


--
-- Name: sys_permission_set sys_permission_set_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permission_set
    ADD CONSTRAINT sys_permission_set_pkey PRIMARY KEY (set_id);


--
-- Name: sys_permission_set sys_permission_set_set_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permission_set
    ADD CONSTRAINT sys_permission_set_set_code_key UNIQUE (set_code);


--
-- Name: sys_permissions sys_permissions_perm_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permissions
    ADD CONSTRAINT sys_permissions_perm_code_key UNIQUE (perm_code);


--
-- Name: sys_permissions sys_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permissions
    ADD CONSTRAINT sys_permissions_pkey PRIMARY KEY (id);


--
-- Name: sys_role_conflict sys_role_conflict_menu_a_menu_b_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_conflict
    ADD CONSTRAINT sys_role_conflict_menu_a_menu_b_key UNIQUE (menu_a, menu_b);


--
-- Name: sys_role_conflict sys_role_conflict_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_conflict
    ADD CONSTRAINT sys_role_conflict_pkey PRIMARY KEY (id);


--
-- Name: sys_role_menu_permission sys_role_menu_permission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_menu_permission
    ADD CONSTRAINT sys_role_menu_permission_pkey PRIMARY KEY (perm_id);


--
-- Name: sys_role_menu_permission sys_role_menu_permission_role_id_menu_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_menu_permission
    ADD CONSTRAINT sys_role_menu_permission_role_id_menu_id_key UNIQUE (role_id, menu_id);


--
-- Name: sys_role_permission_set sys_role_permission_set_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_permission_set
    ADD CONSTRAINT sys_role_permission_set_pkey PRIMARY KEY (role_id, set_id);


--
-- Name: sys_role sys_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role
    ADD CONSTRAINT sys_role_pkey PRIMARY KEY (role_id);


--
-- Name: sys_role sys_role_role_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role
    ADD CONSTRAINT sys_role_role_code_key UNIQUE (role_code);


--
-- Name: sys_settings sys_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_settings
    ADD CONSTRAINT sys_settings_pkey PRIMARY KEY (key);


--
-- Name: sys_store sys_store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_store
    ADD CONSTRAINT sys_store_pkey PRIMARY KEY (store_id);


--
-- Name: sys_store sys_store_store_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_store
    ADD CONSTRAINT sys_store_store_code_key UNIQUE (store_code);


--
-- Name: sys_user_orgs sys_user_orgs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_orgs
    ADD CONSTRAINT sys_user_orgs_pkey PRIMARY KEY (id);


--
-- Name: sys_user_permission_set sys_user_permission_set_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_permission_set
    ADD CONSTRAINT sys_user_permission_set_pkey PRIMARY KEY (user_id, set_id);


--
-- Name: sys_user sys_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user
    ADD CONSTRAINT sys_user_pkey PRIMARY KEY (user_id);


--
-- Name: sys_user_project_scopes sys_user_project_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_project_scopes
    ADD CONSTRAINT sys_user_project_scopes_pkey PRIMARY KEY (id);


--
-- Name: sys_user_role sys_user_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_role
    ADD CONSTRAINT sys_user_role_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: sys_user sys_user_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user
    ADD CONSTRAINT sys_user_username_key UNIQUE (username);


--
-- Name: sys_user_warehouse_scopes sys_user_warehouse_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_warehouse_scopes
    ADD CONSTRAINT sys_user_warehouse_scopes_pkey PRIMARY KEY (id);


--
-- Name: uat_checklists uat_checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_checklists
    ADD CONSTRAINT uat_checklists_pkey PRIMARY KEY (id);


--
-- Name: uat_feedbacks uat_feedbacks_feedback_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_feedbacks
    ADD CONSTRAINT uat_feedbacks_feedback_no_key UNIQUE (feedback_no);


--
-- Name: uat_feedbacks uat_feedbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_feedbacks
    ADD CONSTRAINT uat_feedbacks_pkey PRIMARY KEY (id);


--
-- Name: uat_pilot_runs uat_pilot_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_pilot_runs
    ADD CONSTRAINT uat_pilot_runs_pkey PRIMARY KEY (id);


--
-- Name: uat_pilot_runs uat_pilot_runs_run_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_pilot_runs
    ADD CONSTRAINT uat_pilot_runs_run_no_key UNIQUE (run_no);


--
-- Name: uat_training_records uat_training_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_training_records
    ADD CONSTRAINT uat_training_records_pkey PRIMARY KEY (id);


--
-- Name: uat_training_records uat_training_records_training_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_training_records
    ADD CONSTRAINT uat_training_records_training_no_key UNIQUE (training_no);


--
-- Name: sys_data_scopes uq_data_scope_role_module; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_data_scopes
    ADD CONSTRAINT uq_data_scope_role_module UNIQUE (role_code, module_code);


--
-- Name: inv_source_mode uq_inv_source_mode; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_source_mode
    ADD CONSTRAINT uq_inv_source_mode UNIQUE (scope_level, scope_code);


--
-- Name: pilot_daily_reports uq_pilot_daily_report; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_daily_reports
    ADD CONSTRAINT uq_pilot_daily_report UNIQUE (pilot_run_id, report_date);


--
-- Name: prc2_projects uq_prc2_projects_company_project; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prc2_projects
    ADD CONSTRAINT uq_prc2_projects_company_project UNIQUE (company_code, project_code);


--
-- Name: sys_user_orgs uq_user_org; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_orgs
    ADD CONSTRAINT uq_user_org UNIQUE (user_id, org_id);


--
-- Name: sys_user_project_scopes uq_user_project; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_project_scopes
    ADD CONSTRAINT uq_user_project UNIQUE (user_id, project_code);


--
-- Name: sys_user_warehouse_scopes uq_user_warehouse; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_warehouse_scopes
    ADD CONSTRAINT uq_user_warehouse UNIQUE (user_id, warehouse_code);


--
-- Name: wf_approval_instance_steps wf_approval_instance_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_approval_instance_steps
    ADD CONSTRAINT wf_approval_instance_steps_pkey PRIMARY KEY (id);


--
-- Name: wf_approval_instances wf_approval_instances_instance_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_approval_instances
    ADD CONSTRAINT wf_approval_instances_instance_no_key UNIQUE (instance_no);


--
-- Name: wf_approval_instances wf_approval_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_approval_instances
    ADD CONSTRAINT wf_approval_instances_pkey PRIMARY KEY (id);


--
-- Name: wf_approval_rule_steps wf_approval_rule_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_approval_rule_steps
    ADD CONSTRAINT wf_approval_rule_steps_pkey PRIMARY KEY (id);


--
-- Name: wf_approval_rules wf_approval_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_approval_rules
    ADD CONSTRAINT wf_approval_rules_pkey PRIMARY KEY (id);


--
-- Name: wf_approval_rules wf_approval_rules_rule_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_approval_rules
    ADD CONSTRAINT wf_approval_rules_rule_code_key UNIQUE (rule_code);


--
-- Name: wf_cc_task wf_cc_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_cc_task
    ADD CONSTRAINT wf_cc_task_pkey PRIMARY KEY (id);


--
-- Name: wf_data_source wf_data_source_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_data_source
    ADD CONSTRAINT wf_data_source_code_key UNIQUE (code);


--
-- Name: wf_data_source wf_data_source_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_data_source
    ADD CONSTRAINT wf_data_source_pkey PRIMARY KEY (id);


--
-- Name: wf_definition wf_definition_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_definition
    ADD CONSTRAINT wf_definition_code_key UNIQUE (code);


--
-- Name: wf_definition wf_definition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_definition
    ADD CONSTRAINT wf_definition_pkey PRIMARY KEY (id);


--
-- Name: wf_definition_version wf_definition_version_definition_id_version_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_definition_version
    ADD CONSTRAINT wf_definition_version_definition_id_version_no_key UNIQUE (definition_id, version_no);


--
-- Name: wf_definition_version wf_definition_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_definition_version
    ADD CONSTRAINT wf_definition_version_pkey PRIMARY KEY (id);


--
-- Name: wf_form_definition wf_form_definition_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_form_definition
    ADD CONSTRAINT wf_form_definition_code_key UNIQUE (code);


--
-- Name: wf_form_definition wf_form_definition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_form_definition
    ADD CONSTRAINT wf_form_definition_pkey PRIMARY KEY (id);


--
-- Name: wf_form_submission wf_form_submission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_form_submission
    ADD CONSTRAINT wf_form_submission_pkey PRIMARY KEY (id);


--
-- Name: wf_form_submission wf_form_submission_submission_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_form_submission
    ADD CONSTRAINT wf_form_submission_submission_no_key UNIQUE (submission_no);


--
-- Name: wf_form_version wf_form_version_form_id_version_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_form_version
    ADD CONSTRAINT wf_form_version_form_id_version_no_key UNIQUE (form_id, version_no);


--
-- Name: wf_form_version wf_form_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_form_version
    ADD CONSTRAINT wf_form_version_pkey PRIMARY KEY (id);


--
-- Name: wf_instance wf_instance_instance_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_instance
    ADD CONSTRAINT wf_instance_instance_no_key UNIQUE (instance_no);


--
-- Name: wf_instance wf_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_instance
    ADD CONSTRAINT wf_instance_pkey PRIMARY KEY (id);


--
-- Name: wf_instance_variable wf_instance_variable_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_instance_variable
    ADD CONSTRAINT wf_instance_variable_pkey PRIMARY KEY (id);


--
-- Name: wf_task_action wf_task_action_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_task_action
    ADD CONSTRAINT wf_task_action_pkey PRIMARY KEY (id);


--
-- Name: wf_task wf_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_task
    ADD CONSTRAINT wf_task_pkey PRIMARY KEY (id);


--
-- Name: wf_task wf_task_task_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_task
    ADD CONSTRAINT wf_task_task_no_key UNIQUE (task_no);


--
-- Name: wms_inbound_items wms_inbound_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_inbound_items
    ADD CONSTRAINT wms_inbound_items_pkey PRIMARY KEY (id);


--
-- Name: wms_inbound wms_inbound_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_inbound
    ADD CONSTRAINT wms_inbound_pkey PRIMARY KEY (id);


--
-- Name: wms_inbound wms_inbound_task_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_inbound
    ADD CONSTRAINT wms_inbound_task_no_key UNIQUE (task_no);


--
-- Name: wms_locations wms_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_locations
    ADD CONSTRAINT wms_locations_pkey PRIMARY KEY (location_code);


--
-- Name: wms_outbound_items wms_outbound_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_outbound_items
    ADD CONSTRAINT wms_outbound_items_pkey PRIMARY KEY (id);


--
-- Name: wms_outbound wms_outbound_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_outbound
    ADD CONSTRAINT wms_outbound_pkey PRIMARY KEY (id);


--
-- Name: wms_stock_balance wms_stock_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_balance
    ADD CONSTRAINT wms_stock_balance_pkey PRIMARY KEY (id);


--
-- Name: wms_stock_balance wms_stock_balance_warehouse_code_location_code_spec_code_ba_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_balance
    ADD CONSTRAINT wms_stock_balance_warehouse_code_location_code_spec_code_ba_key UNIQUE (warehouse_code, location_code, spec_code, batch_no);


--
-- Name: wms_stock_ledger wms_stock_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_ledger
    ADD CONSTRAINT wms_stock_ledger_pkey PRIMARY KEY (id);


--
-- Name: wms_stock_transfers wms_stock_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_transfers
    ADD CONSTRAINT wms_stock_transfers_pkey PRIMARY KEY (id);


--
-- Name: wms_stock_transfers wms_stock_transfers_transfer_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_transfers
    ADD CONSTRAINT wms_stock_transfers_transfer_no_key UNIQUE (transfer_no);


--
-- Name: wms_stocktake wms_stocktake_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stocktake
    ADD CONSTRAINT wms_stocktake_pkey PRIMARY KEY (id);


--
-- Name: wms_stocktake wms_stocktake_stocktake_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stocktake
    ADD CONSTRAINT wms_stocktake_stocktake_no_key UNIQUE (stocktake_no);


--
-- Name: wms_suppliers wms_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_suppliers
    ADD CONSTRAINT wms_suppliers_pkey PRIMARY KEY (id);


--
-- Name: wms_suppliers wms_suppliers_supplier_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_suppliers
    ADD CONSTRAINT wms_suppliers_supplier_code_key UNIQUE (supplier_code);


--
-- Name: wms_transfer wms_transfer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_transfer
    ADD CONSTRAINT wms_transfer_pkey PRIMARY KEY (id);


--
-- Name: wms_transfer wms_transfer_transfer_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_transfer
    ADD CONSTRAINT wms_transfer_transfer_no_key UNIQUE (transfer_no);


--
-- Name: wms_warehouses wms_warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_warehouses
    ADD CONSTRAINT wms_warehouses_pkey PRIMARY KEY (id);


--
-- Name: wms_warehouses wms_warehouses_warehouse_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_warehouses
    ADD CONSTRAINT wms_warehouses_warehouse_code_key UNIQUE (warehouse_code);


--
-- Name: wms_zones wms_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_zones
    ADD CONSTRAINT wms_zones_pkey PRIMARY KEY (id);


--
-- Name: wms_zones wms_zones_zone_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_zones
    ADD CONSTRAINT wms_zones_zone_code_key UNIQUE (zone_code);


--
-- Name: ws_contracts ws_contracts_contract_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ws_contracts
    ADD CONSTRAINT ws_contracts_contract_no_key UNIQUE (contract_no);


--
-- Name: ws_contracts ws_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ws_contracts
    ADD CONSTRAINT ws_contracts_pkey PRIMARY KEY (id);


--
-- Name: ws_shipments ws_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ws_shipments
    ADD CONSTRAINT ws_shipments_pkey PRIMARY KEY (id);


--
-- Name: ws_shipments ws_shipments_shipment_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ws_shipments
    ADD CONSTRAINT ws_shipments_shipment_no_key UNIQUE (shipment_no);


--
-- Name: daily_close_close_no_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_close_close_no_idx ON public.daily_close USING btree (close_no);


--
-- Name: fin_txn_txn_no_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fin_txn_txn_no_idx ON public.fin_transactions USING btree (txn_no);


--
-- Name: idx_acc_ledger_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_ledger_ref ON public.acc_ledger USING btree (ref_no);


--
-- Name: idx_acc_ledger_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_ledger_store ON public.acc_ledger USING btree (store_code);


--
-- Name: idx_acc_ledger_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_ledger_type ON public.acc_ledger USING btree (ledger_type);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.sys_audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_audit_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_time ON public.sys_audit_log USING btree (created_at);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.sys_audit_log USING btree (user_id);


--
-- Name: idx_brd_daily_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brd_daily_logs_date ON public.brd_daily_logs USING btree (log_date);


--
-- Name: idx_brd_daily_logs_house; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brd_daily_logs_house ON public.brd_daily_logs USING btree (house_code);


--
-- Name: idx_brd_med_rec_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brd_med_rec_date ON public.brd_medication_records USING btree (start_date);


--
-- Name: idx_brd_med_rec_flock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brd_med_rec_flock ON public.brd_medication_records USING btree (flock_no);


--
-- Name: idx_brd_med_rec_med; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brd_med_rec_med ON public.brd_medication_records USING btree (medication_code);


--
-- Name: idx_brd_med_rec_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brd_med_rec_site ON public.brd_medication_records USING btree (site_code);


--
-- Name: idx_daily_close_close_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_close_close_no ON public.daily_close USING btree (close_no);


--
-- Name: idx_daily_close_store_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_close_store_date ON public.daily_close USING btree (store_code, close_date);


--
-- Name: idx_data_quality_alerts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_quality_alerts_created_at ON public.data_quality_alerts USING btree (created_at);


--
-- Name: idx_data_quality_alerts_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_quality_alerts_severity ON public.data_quality_alerts USING btree (severity);


--
-- Name: idx_data_quality_alerts_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_quality_alerts_source ON public.data_quality_alerts USING btree (source);


--
-- Name: idx_data_quality_alerts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_quality_alerts_status ON public.data_quality_alerts USING btree (status);


--
-- Name: idx_data_quality_score_snapshots_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_quality_score_snapshots_at ON public.data_quality_score_snapshots USING btree (snapshot_at DESC);


--
-- Name: idx_data_scopes_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_scopes_enabled ON public.sys_data_scopes USING btree (enabled) WHERE (enabled = true);


--
-- Name: idx_data_scopes_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_scopes_module ON public.sys_data_scopes USING btree (module_code);


--
-- Name: idx_data_scopes_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_scopes_role ON public.sys_data_scopes USING btree (role_code);


--
-- Name: idx_fin_alloc_ar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_alloc_ar ON public.fin_ar_receipt_allocations USING btree (ar_invoice_id);


--
-- Name: idx_fin_alloc_receipt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_alloc_receipt ON public.fin_ar_receipt_allocations USING btree (receipt_id);


--
-- Name: idx_fin_ap_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ap_company_status ON public.fin_ap_invoices USING btree (company_code, status);


--
-- Name: idx_fin_ap_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ap_due_date ON public.fin_ap_invoices USING btree (due_date) WHERE (due_date IS NOT NULL);


--
-- Name: idx_fin_ap_supplier_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ap_supplier_status ON public.fin_ap_invoices USING btree (supplier_code, status) WHERE (supplier_code IS NOT NULL);


--
-- Name: idx_fin_ar_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ar_company_status ON public.fin_ar_invoices USING btree (company_code, status);


--
-- Name: idx_fin_ar_customer_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ar_customer_status ON public.fin_ar_invoices USING btree (customer_code, status) WHERE (customer_code IS NOT NULL);


--
-- Name: idx_fin_ar_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ar_due_date ON public.fin_ar_invoices USING btree (due_date) WHERE (due_date IS NOT NULL);


--
-- Name: idx_fin_ar_inv_sal_cust; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ar_inv_sal_cust ON public.fin_ar_invoices USING btree (sal_customer_id) WHERE (sal_customer_id IS NOT NULL);


--
-- Name: idx_fin_ar_rec_sal_cust; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ar_rec_sal_cust ON public.fin_ar_receipts USING btree (sal_customer_id) WHERE (sal_customer_id IS NOT NULL);


--
-- Name: idx_fin_ar_receipts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ar_receipts_company ON public.fin_ar_receipts USING btree (company_code, status);


--
-- Name: idx_fin_ar_receipts_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ar_receipts_customer ON public.fin_ar_receipts USING btree (customer_code) WHERE (customer_code IS NOT NULL);


--
-- Name: idx_fin_ar_source_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_ar_source_no ON public.fin_ar_invoices USING btree (source_no) WHERE (source_no IS NOT NULL);


--
-- Name: idx_fin_bank_accounts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_bank_accounts_company ON public.fin_bank_accounts USING btree (company_code);


--
-- Name: idx_fin_bank_accounts_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_bank_accounts_currency ON public.fin_bank_accounts USING btree (currency_code);


--
-- Name: idx_fin_bank_accounts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_bank_accounts_status ON public.fin_bank_accounts USING btree (status);


--
-- Name: idx_fin_cash_accounts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_cash_accounts_company ON public.fin_cash_accounts USING btree (company_code, status);


--
-- Name: idx_fin_cash_txn_account_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_cash_txn_account_date ON public.fin_cash_transactions USING btree (account_id, txn_date DESC);


--
-- Name: idx_fin_cash_txn_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_cash_txn_company_date ON public.fin_cash_transactions USING btree (company_code, txn_date DESC);


--
-- Name: idx_fin_expense_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_expense_company_status ON public.fin_expense_requests USING btree (company_code, status);


--
-- Name: idx_fin_exrate_pair_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_exrate_pair_date ON public.fin_exchange_rates USING btree (from_currency, to_currency, rate_date DESC);


--
-- Name: idx_fin_fund_transfers_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_fund_transfers_company ON public.fin_fund_transfers USING btree (company_code, status);


--
-- Name: idx_fin_reimb_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_reimb_company_status ON public.fin_reimbursements USING btree (company_code, status);


--
-- Name: idx_fin_reimb_expense; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_reimb_expense ON public.fin_reimbursements USING btree (expense_request_id);


--
-- Name: idx_fin_sh_contrib_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_sh_contrib_company ON public.fin_shareholder_contributions USING btree (company_code, status);


--
-- Name: idx_fin_sh_settle_contrib; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_sh_settle_contrib ON public.fin_shareholder_settlements USING btree (contribution_id, status);


--
-- Name: idx_fin_txn_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_txn_account ON public.fin_transactions USING btree (account_code);


--
-- Name: idx_fin_txn_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_txn_ref ON public.fin_transactions USING btree (ref_no);


--
-- Name: idx_fin_txn_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_txn_status ON public.fin_transactions USING btree (status);


--
-- Name: idx_fin_txn_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_txn_type ON public.fin_transactions USING btree (type);


--
-- Name: idx_inv_batches_collection_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_collection_ref ON public.inv_batches USING btree (collection_batch_ref) WHERE (collection_batch_ref IS NOT NULL);


--
-- Name: idx_inv_batches_collection_ref2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_collection_ref2 ON public.inv_batches USING btree (collection_batch_ref) WHERE (collection_batch_ref IS NOT NULL);


--
-- Name: idx_inv_batches_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_company ON public.inv_batches USING btree (company_code);


--
-- Name: idx_inv_batches_egg_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_egg_date ON public.inv_batches USING btree (egg_date);


--
-- Name: idx_inv_batches_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_expire ON public.inv_batches USING btree (expire_date);


--
-- Name: idx_inv_batches_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_grade ON public.inv_batches USING btree (quality_grade);


--
-- Name: idx_inv_batches_grade_code_std; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_grade_code_std ON public.inv_batches USING btree (grade_code_std) WHERE (grade_code_std IS NOT NULL);


--
-- Name: idx_inv_batches_legacy_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_legacy_source ON public.inv_batches USING btree (legacy_source) WHERE (legacy_source IS NOT NULL);


--
-- Name: idx_inv_batches_pkg_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_pkg_ref ON public.inv_batches USING btree (packaging_batch_ref) WHERE (packaging_batch_ref IS NOT NULL);


--
-- Name: idx_inv_batches_pkg_ref2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_pkg_ref2 ON public.inv_batches USING btree (packaging_batch_ref) WHERE (packaging_batch_ref IS NOT NULL);


--
-- Name: idx_inv_batches_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_product ON public.inv_batches USING btree (product_code);


--
-- Name: idx_inv_batches_saleable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_saleable ON public.inv_batches USING btree (company_code, product_code, expire_date) WHERE ((legacy_source IS NULL) AND ((status)::text = 'AVAILABLE'::text));


--
-- Name: idx_inv_batches_sku_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_sku_code ON public.inv_batches USING btree (sku_code) WHERE (sku_code IS NOT NULL);


--
-- Name: idx_inv_batches_spec_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_spec_code ON public.inv_batches USING btree (spec_code) WHERE (spec_code IS NOT NULL);


--
-- Name: idx_inv_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_status ON public.inv_batches USING btree (status);


--
-- Name: idx_inv_batches_status_exp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_status_exp ON public.inv_batches USING btree (status, expire_date);


--
-- Name: idx_inv_batches_wh; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_batches_wh ON public.inv_batches USING btree (warehouse_code);


--
-- Name: idx_inv_ledger_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_ledger_batch ON public.inv_ledger USING btree (batch_no);


--
-- Name: idx_inv_ledger_batch_trace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_ledger_batch_trace ON public.inv_ledger USING btree (batch_no);


--
-- Name: idx_inv_ledger_change; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_ledger_change ON public.inv_ledger USING btree (change_type);


--
-- Name: idx_inv_ledger_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_ledger_company ON public.inv_ledger USING btree (company_code);


--
-- Name: idx_inv_ledger_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_ledger_ref ON public.inv_ledger USING btree (ref_no);


--
-- Name: idx_inv_ledger_sku_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_ledger_sku_code ON public.inv_ledger USING btree (sku_code) WHERE (sku_code IS NOT NULL);


--
-- Name: idx_inv_source_mode_audit_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_source_mode_audit_scope ON public.inv_source_mode_audit USING btree (scope_level, scope_code, created_at DESC);


--
-- Name: idx_inv_source_mode_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_source_mode_scope ON public.inv_source_mode USING btree (scope_level, scope_code);


--
-- Name: idx_lbl_records_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lbl_records_batch ON public.lbl_records USING btree (batch_no);


--
-- Name: idx_lbl_records_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lbl_records_label ON public.lbl_records USING btree (label_no);


--
-- Name: idx_md_governance_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_md_governance_events_created_at ON public.md_governance_events USING btree (created_at DESC);


--
-- Name: idx_md_governance_events_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_md_governance_events_severity ON public.md_governance_events USING btree (severity);


--
-- Name: idx_md_governance_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_md_governance_events_type ON public.md_governance_events USING btree (event_type);


--
-- Name: idx_md_governance_snapshots_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_md_governance_snapshots_at ON public.md_governance_snapshots USING btree (snapshot_at DESC);


--
-- Name: idx_mon_history_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mon_history_search ON public.mon_device_property_history USING btree (erp_house_code, property_code, log_date);


--
-- Name: idx_mst_audit_obj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mst_audit_obj ON public.mst_audit_trail USING btree (object_type, object_code);


--
-- Name: idx_mst_audit_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mst_audit_time ON public.mst_audit_trail USING btree (created_at);


--
-- Name: idx_mst_bank_holder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mst_bank_holder ON public.mst_bank_accounts USING btree (holder_code);


--
-- Name: idx_mst_merge_obj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mst_merge_obj ON public.mst_merge_log USING btree (object_type, source_code);


--
-- Name: idx_notifications_biz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_biz ON public.sys_notifications USING btree (biz_type, biz_id) WHERE (biz_type IS NOT NULL);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.sys_notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_status ON public.sys_notifications USING btree (user_id, status);


--
-- Name: idx_oplogs_biz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oplogs_biz ON public.sys_operation_logs USING btree (biz_type, biz_id) WHERE (biz_type IS NOT NULL);


--
-- Name: idx_oplogs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oplogs_created ON public.sys_operation_logs USING btree (created_at DESC);


--
-- Name: idx_oplogs_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oplogs_module ON public.sys_operation_logs USING btree (module_code, action_code);


--
-- Name: idx_oplogs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oplogs_user ON public.sys_operation_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_ord_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ord_orders_customer ON public.ord_orders USING btree (customer_id);


--
-- Name: idx_ord_orders_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ord_orders_store ON public.ord_orders USING btree (store_code);


--
-- Name: idx_orgs_business_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_business_type ON public.sys_organizations USING btree (site_business_type) WHERE (site_business_type IS NOT NULL);


--
-- Name: idx_orgs_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_code ON public.sys_organizations USING btree (org_code);


--
-- Name: idx_orgs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_company ON public.sys_organizations USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_orgs_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_parent ON public.sys_organizations USING btree (parent_id);


--
-- Name: idx_orgs_parent_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_parent_code ON public.sys_organizations USING btree (parent_code) WHERE (parent_code IS NOT NULL);


--
-- Name: idx_orgs_site_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_site_code ON public.sys_organizations USING btree (site_code) WHERE (site_code IS NOT NULL);


--
-- Name: idx_orgs_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_sort ON public.sys_organizations USING btree (sort_order, org_code);


--
-- Name: idx_orgs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_status ON public.sys_organizations USING btree (status);


--
-- Name: idx_orgs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orgs_type ON public.sys_organizations USING btree (org_type);


--
-- Name: idx_packaging_specs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_packaging_specs_status ON public.packaging_specs USING btree (status);


--
-- Name: idx_pdr_pilot_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pdr_pilot_run_id ON public.pilot_daily_reports USING btree (pilot_run_id);


--
-- Name: idx_pdr_report_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pdr_report_date ON public.pilot_daily_reports USING btree (report_date DESC);


--
-- Name: idx_pdr_score_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pdr_score_status ON public.pilot_daily_reports USING btree (score_status);


--
-- Name: idx_pkg_grading_prod_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pkg_grading_prod_date ON public.pkg_grading_records USING btree (production_date);


--
-- Name: idx_pkg_packing_prod_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pkg_packing_prod_date ON public.pkg_packing_records USING btree (production_date);


--
-- Name: idx_pkg_packing_records_shift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pkg_packing_records_shift ON public.pkg_packing_records USING btree (shift_id);


--
-- Name: idx_pkg_source_batches_shift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pkg_source_batches_shift ON public.pkg_source_batches USING btree (shift_id);


--
-- Name: idx_pkg_source_house; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pkg_source_house ON public.pkg_source_batches USING btree (house_code);


--
-- Name: idx_pkg_source_prod_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pkg_source_prod_date ON public.pkg_source_batches USING btree (production_date);


--
-- Name: idx_pkg_tasks_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pkg_tasks_batch ON public.pkg_tasks USING btree (batch_no);


--
-- Name: idx_pkg_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pkg_tasks_status ON public.pkg_tasks USING btree (status);


--
-- Name: idx_pkg_work_shifts_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pkg_work_shifts_site ON public.pkg_work_shifts USING btree (site_id);


--
-- Name: idx_pos_sale_items_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sale_items_sale ON public.pos_sale_items USING btree (sale_no);


--
-- Name: idx_pos_sales_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sales_created ON public.pos_sales USING btree (created_at);


--
-- Name: idx_pos_sales_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sales_session ON public.pos_sales USING btree (session_no);


--
-- Name: idx_pos_sales_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sales_store ON public.pos_sales USING btree (store_code);


--
-- Name: idx_prc2_ap_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_ap_company ON public.prc2_ap_ledger USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_prc2_ap_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_ap_due_date ON public.prc2_ap_ledger USING btree (due_date) WHERE (due_date IS NOT NULL);


--
-- Name: idx_prc2_ap_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_ap_status ON public.prc2_ap_ledger USING btree (status);


--
-- Name: idx_prc2_ap_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_ap_supplier ON public.prc2_ap_ledger USING btree (supplier_code) WHERE (supplier_code IS NOT NULL);


--
-- Name: idx_prc2_appr_approver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_appr_approver ON public.prc2_approvals USING btree (approver_id) WHERE (approver_id IS NOT NULL);


--
-- Name: idx_prc2_appr_biz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_appr_biz ON public.prc2_approvals USING btree (biz_type, biz_id);


--
-- Name: idx_prc2_ibatch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_ibatch_status ON public.prc2_init_batches USING btree (status);


--
-- Name: idx_prc2_ibrow_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_ibrow_batch_id ON public.prc2_init_batch_rows USING btree (batch_id);


--
-- Name: idx_prc2_ibrow_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_ibrow_status ON public.prc2_init_batch_rows USING btree (status);


--
-- Name: idx_prc2_palloc_ap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_palloc_ap ON public.prc2_payment_allocations USING btree (ap_id) WHERE (ap_id IS NOT NULL);


--
-- Name: idx_prc2_palloc_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_palloc_payment ON public.prc2_payment_allocations USING btree (payment_id);


--
-- Name: idx_prc2_palloc_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_palloc_po ON public.prc2_payment_allocations USING btree (po_id) WHERE (po_id IS NOT NULL);


--
-- Name: idx_prc2_pay_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_pay_company ON public.prc2_payments USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_prc2_pay_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_pay_date ON public.prc2_payments USING btree (payment_date) WHERE (payment_date IS NOT NULL);


--
-- Name: idx_prc2_pay_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_pay_project ON public.prc2_payments USING btree (project_code) WHERE (project_code IS NOT NULL);


--
-- Name: idx_prc2_pay_shareholder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_pay_shareholder ON public.prc2_payments USING btree (shareholder_id) WHERE (shareholder_id IS NOT NULL);


--
-- Name: idx_prc2_pay_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_pay_status ON public.prc2_payments USING btree (status);


--
-- Name: idx_prc2_po_approval_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_po_approval_status ON public.prc2_purchase_orders USING btree (approval_status);


--
-- Name: idx_prc2_po_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_po_company ON public.prc2_purchase_orders USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_prc2_po_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_po_project ON public.prc2_purchase_orders USING btree (project_code) WHERE (project_code IS NOT NULL);


--
-- Name: idx_prc2_po_source_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_po_source_req ON public.prc2_purchase_orders USING btree (source_request_id) WHERE (source_request_id IS NOT NULL);


--
-- Name: idx_prc2_po_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_po_status ON public.prc2_purchase_orders USING btree (status);


--
-- Name: idx_prc2_po_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_po_supplier ON public.prc2_purchase_orders USING btree (supplier_code) WHERE (supplier_code IS NOT NULL);


--
-- Name: idx_prc2_poi_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_poi_po_id ON public.prc2_order_items USING btree (po_id);


--
-- Name: idx_prc2_poi_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_poi_project ON public.prc2_order_items USING btree (project_code) WHERE (project_code IS NOT NULL);


--
-- Name: idx_prc2_proj_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_proj_company ON public.prc2_projects USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_prc2_proj_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_proj_status ON public.prc2_projects USING btree (status);


--
-- Name: idx_prc2_rcpt_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_rcpt_company ON public.prc2_receipts USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_prc2_rcpt_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_rcpt_po_id ON public.prc2_receipts USING btree (po_id);


--
-- Name: idx_prc2_rcpt_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_rcpt_status ON public.prc2_receipts USING btree (status);


--
-- Name: idx_prc2_rcpti_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_rcpti_project ON public.prc2_receipt_items USING btree (project_code) WHERE (project_code IS NOT NULL);


--
-- Name: idx_prc2_rcpti_receipt_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_rcpti_receipt_id ON public.prc2_receipt_items USING btree (receipt_id);


--
-- Name: idx_prc2_req_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_req_company ON public.prc2_purchase_requests USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_prc2_req_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_req_project ON public.prc2_purchase_requests USING btree (project_code) WHERE (project_code IS NOT NULL);


--
-- Name: idx_prc2_req_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_req_requester ON public.prc2_purchase_requests USING btree (requester_id) WHERE (requester_id IS NOT NULL);


--
-- Name: idx_prc2_req_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_req_status ON public.prc2_purchase_requests USING btree (status);


--
-- Name: idx_prc2_reqitem_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_reqitem_project ON public.prc2_request_items USING btree (project_code) WHERE (project_code IS NOT NULL);


--
-- Name: idx_prc2_reqitem_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_reqitem_request ON public.prc2_request_items USING btree (request_id);


--
-- Name: idx_prc2_sfund_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_sfund_company ON public.prc2_shareholder_funds USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_prc2_sfund_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_sfund_project ON public.prc2_shareholder_funds USING btree (project_code) WHERE (project_code IS NOT NULL);


--
-- Name: idx_prc2_sfund_shareholder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_sfund_shareholder ON public.prc2_shareholder_funds USING btree (shareholder_id) WHERE (shareholder_id IS NOT NULL);


--
-- Name: idx_prc2_sfund_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_sfund_status ON public.prc2_shareholder_funds USING btree (status);


--
-- Name: idx_prc2_ship_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_ship_po_id ON public.prc2_shipments USING btree (po_id) WHERE (po_id IS NOT NULL);


--
-- Name: idx_prc2_ship_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_ship_status ON public.prc2_shipments USING btree (status);


--
-- Name: idx_prc2_ship_tracking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_ship_tracking ON public.prc2_shipments USING btree (tracking_no) WHERE (tracking_no IS NOT NULL);


--
-- Name: idx_prc2_sup_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_sup_company ON public.prc2_suppliers USING btree (owner_company_code) WHERE (owner_company_code IS NOT NULL);


--
-- Name: idx_prc2_sup_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_sup_scope ON public.prc2_suppliers USING btree (shared_scope);


--
-- Name: idx_prc2_sup_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prc2_sup_status ON public.prc2_suppliers USING btree (status);


--
-- Name: idx_product_grades_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_grades_status ON public.product_grades USING btree (status);


--
-- Name: idx_product_master_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_master_category ON public.product_master USING btree (category);


--
-- Name: idx_product_master_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_master_status ON public.product_master USING btree (status);


--
-- Name: idx_product_skus_combo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_product_skus_combo ON public.product_skus USING btree (product_code, grade_code, spec_code);


--
-- Name: idx_product_skus_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_skus_grade ON public.product_skus USING btree (grade_code);


--
-- Name: idx_product_skus_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_skus_product ON public.product_skus USING btree (product_code);


--
-- Name: idx_product_skus_spec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_skus_spec ON public.product_skus USING btree (spec_code);


--
-- Name: idx_product_skus_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_skus_status ON public.product_skus USING btree (status);


--
-- Name: idx_sal_channels_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_channels_company ON public.sal_channels USING btree (company_code);


--
-- Name: idx_sal_cust_auto_frozen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_cust_auto_frozen ON public.sal_customers USING btree (auto_frozen);


--
-- Name: idx_sal_cust_credit_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_cust_credit_status ON public.sal_customers USING btree (credit_status);


--
-- Name: idx_sal_cust_last_overdue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_cust_last_overdue ON public.sal_customers USING btree (last_overdue_at);


--
-- Name: idx_sal_cust_legacy_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sal_cust_legacy_code ON public.sal_customers USING btree (legacy_customer_code) WHERE (legacy_customer_code IS NOT NULL);


--
-- Name: idx_sal_cust_risk_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_cust_risk_level ON public.sal_customers USING btree (risk_level);


--
-- Name: idx_sal_customers_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_customers_company ON public.sal_customers USING btree (company_code);


--
-- Name: idx_sal_customers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_customers_status ON public.sal_customers USING btree (status);


--
-- Name: idx_sal_customers_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_customers_type ON public.sal_customers USING btree (customer_type);


--
-- Name: idx_sal_do_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_do_company ON public.sal_delivery_orders USING btree (company_code);


--
-- Name: idx_sal_do_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_do_created_at ON public.sal_delivery_orders USING btree (created_at);


--
-- Name: idx_sal_do_driver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_do_driver ON public.sal_delivery_orders USING btree (driver_id);


--
-- Name: idx_sal_do_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_do_status ON public.sal_delivery_orders USING btree (status);


--
-- Name: idx_sal_do_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_do_vehicle ON public.sal_delivery_orders USING btree (vehicle_id);


--
-- Name: idx_sal_do_wave_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_do_wave_date ON public.sal_delivery_orders USING btree (wave_date);


--
-- Name: idx_sal_doi_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_doi_customer ON public.sal_delivery_order_items USING btree (customer_code);


--
-- Name: idx_sal_doi_delivery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_doi_delivery ON public.sal_delivery_order_items USING btree (delivery_order_id);


--
-- Name: idx_sal_doi_so; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_doi_so ON public.sal_delivery_order_items USING btree (sales_order_id);


--
-- Name: idx_sal_doi_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_doi_status ON public.sal_delivery_order_items USING btree (status);


--
-- Name: idx_sal_drivers_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_drivers_company ON public.sal_drivers USING btree (company_code);


--
-- Name: idx_sal_drivers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_drivers_status ON public.sal_drivers USING btree (status);


--
-- Name: idx_sal_order_items_alloc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_order_items_alloc ON public.sal_order_items USING btree (allocated_batch_no) WHERE (allocated_batch_no IS NOT NULL);


--
-- Name: idx_sal_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_order_items_order ON public.sal_order_items USING btree (sales_order_id);


--
-- Name: idx_sal_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_order_items_order_id ON public.sal_order_items USING btree (sales_order_id);


--
-- Name: idx_sal_order_items_sku_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_order_items_sku_code ON public.sal_order_items USING btree (sku_code) WHERE (sku_code IS NOT NULL);


--
-- Name: idx_sal_price_books_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_books_channel ON public.sal_price_books USING btree (channel_code) WHERE (channel_code IS NOT NULL);


--
-- Name: idx_sal_price_books_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_books_company ON public.sal_price_books USING btree (company_code);


--
-- Name: idx_sal_price_books_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_books_customer ON public.sal_price_books USING btree (customer_code) WHERE (customer_code IS NOT NULL);


--
-- Name: idx_sal_price_books_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_books_priority ON public.sal_price_books USING btree (company_code, status, priority);


--
-- Name: idx_sal_price_books_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_books_status ON public.sal_price_books USING btree (status);


--
-- Name: idx_sal_price_items_book; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_items_book ON public.sal_price_items USING btree (price_book_id);


--
-- Name: idx_sal_price_items_book_prod; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_items_book_prod ON public.sal_price_items USING btree (price_book_id, product_code);


--
-- Name: idx_sal_price_items_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_items_grade ON public.sal_price_items USING btree (grade_code, packaging_spec);


--
-- Name: idx_sal_price_items_grade_code_std; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_items_grade_code_std ON public.sal_price_items USING btree (grade_code_std) WHERE (grade_code_std IS NOT NULL);


--
-- Name: idx_sal_price_items_sku_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_items_sku_code ON public.sal_price_items USING btree (sku_code) WHERE (sku_code IS NOT NULL);


--
-- Name: idx_sal_price_items_spec_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_price_items_spec_code ON public.sal_price_items USING btree (spec_code) WHERE (spec_code IS NOT NULL);


--
-- Name: idx_sal_rc_delivery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_rc_delivery ON public.sal_receipts USING btree (delivery_order_id);


--
-- Name: idx_sal_rc_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_rc_item ON public.sal_receipts USING btree (delivery_item_id);


--
-- Name: idx_sal_rc_signed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_rc_signed_at ON public.sal_receipts USING btree (signed_at);


--
-- Name: idx_sal_rc_so; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_rc_so ON public.sal_receipts USING btree (sales_order_id);


--
-- Name: idx_sal_rc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_rc_status ON public.sal_receipts USING btree (status);


--
-- Name: idx_sal_return_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_return_items_product ON public.sal_return_items USING btree (product_code);


--
-- Name: idx_sal_return_items_return_ord; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_return_items_return_ord ON public.sal_return_items USING btree (return_order_id);


--
-- Name: idx_sal_return_items_sku_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_return_items_sku_code ON public.sal_return_items USING btree (sku_code) WHERE (sku_code IS NOT NULL);


--
-- Name: idx_sal_return_orders_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_return_orders_company ON public.sal_return_orders USING btree (company_code);


--
-- Name: idx_sal_return_orders_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_return_orders_created ON public.sal_return_orders USING btree (created_at DESC);


--
-- Name: idx_sal_return_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_return_orders_customer ON public.sal_return_orders USING btree (customer_code);


--
-- Name: idx_sal_return_orders_sales_ord; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_return_orders_sales_ord ON public.sal_return_orders USING btree (sales_order_id);


--
-- Name: idx_sal_return_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_return_orders_status ON public.sal_return_orders USING btree (status);


--
-- Name: idx_sal_sales_orders_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_sales_orders_company ON public.sal_sales_orders USING btree (company_code);


--
-- Name: idx_sal_sales_orders_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_sales_orders_company_status ON public.sal_sales_orders USING btree (company_code, status);


--
-- Name: idx_sal_sales_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_sales_orders_created_at ON public.sal_sales_orders USING btree (created_at DESC);


--
-- Name: idx_sal_sales_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_sales_orders_customer ON public.sal_sales_orders USING btree (customer_code);


--
-- Name: idx_sal_sales_orders_customer_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_sales_orders_customer_code ON public.sal_sales_orders USING btree (customer_code);


--
-- Name: idx_sal_sales_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_sales_orders_status ON public.sal_sales_orders USING btree (status);


--
-- Name: idx_sal_so_credit_warning; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_so_credit_warning ON public.sal_sales_orders USING btree (credit_warning);


--
-- Name: idx_sal_store_items_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_store_items_batch ON public.sal_store_sale_items USING btree (batch_no) WHERE (batch_no IS NOT NULL);


--
-- Name: idx_sal_store_sale_items_sku_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_store_sale_items_sku_code ON public.sal_store_sale_items USING btree (sku_code) WHERE (sku_code IS NOT NULL);


--
-- Name: idx_sal_vehicles_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_vehicles_company ON public.sal_vehicles USING btree (company_code);


--
-- Name: idx_sal_vehicles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sal_vehicles_status ON public.sal_vehicles USING btree (status);


--
-- Name: idx_shr_beneficial_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shr_beneficial_project ON public.shr_beneficial_equity USING btree (project_code);


--
-- Name: idx_shr_contrib_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shr_contrib_project ON public.shr_capital_contributions USING btree (project_code, shareholder_code);


--
-- Name: idx_shr_equity_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shr_equity_project ON public.shr_project_equity USING btree (project_code);


--
-- Name: idx_shr_projects_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shr_projects_company ON public.shr_projects USING btree (company_code);


--
-- Name: idx_shr_scope_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shr_scope_user ON public.shr_shareholder_scopes USING btree (user_id);


--
-- Name: idx_so_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_so_customer ON public.biz_sales_order USING btree (customer_id);


--
-- Name: idx_so_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_so_status ON public.biz_sales_order USING btree (status);


--
-- Name: idx_so_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_so_store ON public.biz_sales_order USING btree (store_code);


--
-- Name: idx_store_closing_opened; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_closing_opened ON public.sal_store_shift_closings USING btree (opened_at DESC);


--
-- Name: idx_store_closing_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_closing_status ON public.sal_store_shift_closings USING btree (status);


--
-- Name: idx_store_closing_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_closing_store ON public.sal_store_shift_closings USING btree (store_code);


--
-- Name: idx_store_sale_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_sale_company ON public.sal_store_sales USING btree (company_code);


--
-- Name: idx_store_sale_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_sale_created ON public.sal_store_sales USING btree (created_at DESC);


--
-- Name: idx_store_sale_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_sale_customer ON public.sal_store_sales USING btree (customer_code) WHERE (customer_code IS NOT NULL);


--
-- Name: idx_store_sale_item_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_sale_item_sale ON public.sal_store_sale_items USING btree (sale_id);


--
-- Name: idx_store_sale_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_sale_payment ON public.sal_store_sales USING btree (payment_status);


--
-- Name: idx_store_sale_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_sale_status ON public.sal_store_sales USING btree (status);


--
-- Name: idx_store_sale_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_sale_store ON public.sal_store_sales USING btree (store_code);


--
-- Name: idx_sys_alert_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_alert_created ON public.sys_alerts USING btree (created_at DESC);


--
-- Name: idx_sys_alert_resolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_alert_resolved ON public.sys_alerts USING btree (resolved) WHERE (resolved = false);


--
-- Name: idx_sys_alert_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_alert_severity ON public.sys_alerts USING btree (severity);


--
-- Name: idx_sys_alert_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_alert_type ON public.sys_alerts USING btree (alert_type);


--
-- Name: idx_sys_cfg_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_cfg_group ON public.sys_configs USING btree (config_group);


--
-- Name: idx_sys_cfg_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_cfg_key ON public.sys_configs USING btree (config_key);


--
-- Name: idx_sys_error_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_error_created ON public.sys_error_logs USING btree (created_at DESC);


--
-- Name: idx_sys_error_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_error_path ON public.sys_error_logs USING btree (request_path);


--
-- Name: idx_sys_error_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_error_status ON public.sys_error_logs USING btree (http_status);


--
-- Name: idx_sys_error_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_error_type ON public.sys_error_logs USING btree (error_type);


--
-- Name: idx_sys_error_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_error_user ON public.sys_error_logs USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_sys_exrate_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_exrate_date ON public.sys_exchange_rates USING btree (rate_date DESC);


--
-- Name: idx_sys_pset_item_set; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_pset_item_set ON public.sys_permission_set_item USING btree (set_id);


--
-- Name: idx_sys_role_menu_perm_menu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_role_menu_perm_menu ON public.sys_role_menu_permission USING btree (menu_id);


--
-- Name: idx_sys_role_menu_perm_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_role_menu_perm_role ON public.sys_role_menu_permission USING btree (role_id);


--
-- Name: idx_sys_rps_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_rps_role ON public.sys_role_permission_set USING btree (role_id);


--
-- Name: idx_sys_ups_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_ups_user ON public.sys_user_permission_set USING btree (user_id);


--
-- Name: idx_sys_user_role_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_user_role_role ON public.sys_user_role USING btree (role_id);


--
-- Name: idx_sys_user_role_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_user_role_user ON public.sys_user_role USING btree (user_id);


--
-- Name: idx_uat_cl_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_cl_company ON public.uat_checklists USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_uat_cl_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_cl_module ON public.uat_checklists USING btree (module_code);


--
-- Name: idx_uat_cl_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_cl_status ON public.uat_checklists USING btree (status);


--
-- Name: idx_uat_fb_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_fb_assignee ON public.uat_feedbacks USING btree (assignee_id) WHERE (assignee_id IS NOT NULL);


--
-- Name: idx_uat_fb_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_fb_company ON public.uat_feedbacks USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_uat_fb_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_fb_created ON public.uat_feedbacks USING btree (created_at DESC);


--
-- Name: idx_uat_fb_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_fb_module ON public.uat_feedbacks USING btree (module_code);


--
-- Name: idx_uat_fb_pilot_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_fb_pilot_run ON public.uat_feedbacks USING btree (pilot_run_id) WHERE (pilot_run_id IS NOT NULL);


--
-- Name: idx_uat_fb_reporter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_fb_reporter ON public.uat_feedbacks USING btree (reporter_id) WHERE (reporter_id IS NOT NULL);


--
-- Name: idx_uat_fb_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_fb_severity ON public.uat_feedbacks USING btree (severity);


--
-- Name: idx_uat_fb_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_fb_status ON public.uat_feedbacks USING btree (status);


--
-- Name: idx_uat_pr_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_pr_company ON public.uat_pilot_runs USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_uat_pr_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_pr_start ON public.uat_pilot_runs USING btree (run_start_date DESC);


--
-- Name: idx_uat_pr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_pr_status ON public.uat_pilot_runs USING btree (status);


--
-- Name: idx_uat_tr_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_tr_company ON public.uat_training_records USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_uat_tr_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_tr_date ON public.uat_training_records USING btree (training_date DESC);


--
-- Name: idx_uat_tr_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uat_tr_type ON public.uat_training_records USING btree (training_type);


--
-- Name: idx_user_orgs_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_orgs_org ON public.sys_user_orgs USING btree (org_id);


--
-- Name: idx_user_orgs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_orgs_user ON public.sys_user_orgs USING btree (user_id);


--
-- Name: idx_user_proj_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_proj_user ON public.sys_user_project_scopes USING btree (user_id);


--
-- Name: idx_user_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_store ON public.sys_user USING btree (store_code);


--
-- Name: idx_user_wh_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_wh_user ON public.sys_user_warehouse_scopes USING btree (user_id);


--
-- Name: idx_wf_form_definition_biz_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_form_definition_biz_type ON public.wf_form_definition USING btree (biz_type) WHERE (biz_type IS NOT NULL);


--
-- Name: idx_wf_form_submission_biz_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_form_submission_biz_type ON public.wf_form_submission USING btree (biz_type) WHERE (biz_type IS NOT NULL);


--
-- Name: idx_wf_form_submission_form_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_form_submission_form_code ON public.wf_form_submission USING btree (form_code);


--
-- Name: idx_wf_form_submission_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_form_submission_status ON public.wf_form_submission USING btree (status);


--
-- Name: idx_wf_form_submission_submitted_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_form_submission_submitted_by ON public.wf_form_submission USING btree (submitted_by) WHERE (submitted_by IS NOT NULL);


--
-- Name: idx_wf_inst_biz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_inst_biz ON public.wf_approval_instances USING btree (biz_type, biz_id);


--
-- Name: idx_wf_inst_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_inst_company ON public.wf_approval_instances USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_wf_inst_form; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_inst_form ON public.wf_approval_instances USING btree (form_submission_id) WHERE (form_submission_id IS NOT NULL);


--
-- Name: idx_wf_inst_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_inst_module ON public.wf_approval_instances USING btree (module_code);


--
-- Name: idx_wf_inst_rule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_inst_rule_id ON public.wf_approval_instances USING btree (rule_id) WHERE (rule_id IS NOT NULL);


--
-- Name: idx_wf_inst_started_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_inst_started_by ON public.wf_approval_instances USING btree (started_by) WHERE (started_by IS NOT NULL);


--
-- Name: idx_wf_inst_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_inst_status ON public.wf_approval_instances USING btree (status);


--
-- Name: idx_wf_instance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_instance_status ON public.wf_instance USING btree (status);


--
-- Name: idx_wf_istep_approver_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_istep_approver_user ON public.wf_approval_instance_steps USING btree (approver_user_id) WHERE (approver_user_id IS NOT NULL);


--
-- Name: idx_wf_istep_due_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_istep_due_at ON public.wf_approval_instance_steps USING btree (due_at) WHERE (due_at IS NOT NULL);


--
-- Name: idx_wf_istep_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_istep_instance_id ON public.wf_approval_instance_steps USING btree (instance_id);


--
-- Name: idx_wf_istep_instance_step; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_istep_instance_step ON public.wf_approval_instance_steps USING btree (instance_id, step_no);


--
-- Name: idx_wf_istep_overdue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_istep_overdue ON public.wf_approval_instance_steps USING btree (is_overdue) WHERE (is_overdue = true);


--
-- Name: idx_wf_istep_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_istep_status ON public.wf_approval_instance_steps USING btree (status);


--
-- Name: idx_wf_istep_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_istep_task ON public.wf_approval_instance_steps USING btree (source_task_id) WHERE (source_task_id IS NOT NULL);


--
-- Name: idx_wf_rule_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_rule_company ON public.wf_approval_rules USING btree (company_code) WHERE (company_code IS NOT NULL);


--
-- Name: idx_wf_rule_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_rule_enabled ON public.wf_approval_rules USING btree (enabled);


--
-- Name: idx_wf_rule_module_biz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_rule_module_biz ON public.wf_approval_rules USING btree (module_code, biz_type);


--
-- Name: idx_wf_rule_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_rule_priority ON public.wf_approval_rules USING btree (priority);


--
-- Name: idx_wf_rule_step_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_rule_step_no ON public.wf_approval_rule_steps USING btree (rule_id, step_no);


--
-- Name: idx_wf_rule_step_rule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_rule_step_rule_id ON public.wf_approval_rule_steps USING btree (rule_id);


--
-- Name: idx_wf_task_todo_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_task_todo_role ON public.wf_task USING btree (status, assignee_role_code);


--
-- Name: idx_wf_task_todo_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_task_todo_user ON public.wf_task USING btree (status, assignee_user_id);


--
-- Name: pda_terminals_serial_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pda_terminals_serial_uq ON public.pda_terminals USING btree (serial) WHERE ((serial IS NOT NULL) AND ((serial)::text <> ''::text));


--
-- Name: uq_brd_med_rec_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_brd_med_rec_batch ON public.brd_medication_records USING btree (batch_no) WHERE (batch_no IS NOT NULL);


--
-- Name: uq_shr_cap_flow_no; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_shr_cap_flow_no ON public.shr_capital_contributions USING btree (capital_flow_no) WHERE (capital_flow_no IS NOT NULL);


--
-- Name: uq_sys_exrate_date_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_sys_exrate_date_pair ON public.sys_exchange_rates USING btree (rate_date, from_currency, to_currency);


--
-- Name: inv_batches inv_batches_sync_available_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inv_batches_sync_available_trg BEFORE INSERT OR UPDATE ON public.inv_batches FOR EACH ROW EXECUTE FUNCTION public.inv_batches_sync_available();


--
-- Name: sys_permission_set_item trg_bump_perms_pset_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_perms_pset_item AFTER INSERT OR DELETE OR UPDATE ON public.sys_permission_set_item FOR EACH ROW EXECUTE FUNCTION public.fn_bump_user_perms_version();


--
-- Name: sys_role_menu_permission trg_bump_perms_role_menu_perm; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_perms_role_menu_perm AFTER INSERT OR DELETE OR UPDATE ON public.sys_role_menu_permission FOR EACH ROW WHEN ((pg_trigger_depth() = 0)) EXECUTE FUNCTION public.fn_bump_user_perms_version();


--
-- Name: sys_role_permission_set trg_bump_perms_role_pset; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_perms_role_pset AFTER INSERT OR DELETE OR UPDATE ON public.sys_role_permission_set FOR EACH ROW EXECUTE FUNCTION public.fn_bump_user_perms_version();


--
-- Name: sys_user_permission_set trg_bump_perms_user_pset; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_perms_user_pset AFTER INSERT OR DELETE OR UPDATE ON public.sys_user_permission_set FOR EACH ROW EXECUTE FUNCTION public.fn_bump_user_perms_version();


--
-- Name: sys_user_role trg_bump_perms_user_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_perms_user_role AFTER INSERT OR DELETE OR UPDATE ON public.sys_user_role FOR EACH ROW EXECUTE FUNCTION public.fn_bump_user_perms_version();


--
-- Name: mon_device_realtime_snapshot mon_device_realtime_snapshot_erp_house_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mon_device_realtime_snapshot
    ADD CONSTRAINT mon_device_realtime_snapshot_erp_house_code_fkey FOREIGN KEY (erp_house_code) REFERENCES public.mon_house_device_mapping(erp_house_code);


--
-- Name: pilot_daily_reports pilot_daily_reports_pilot_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_daily_reports
    ADD CONSTRAINT pilot_daily_reports_pilot_run_id_fkey FOREIGN KEY (pilot_run_id) REFERENCES public.uat_pilot_runs(id);


--
-- Name: sal_delivery_order_items sal_delivery_order_items_delivery_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_delivery_order_items
    ADD CONSTRAINT sal_delivery_order_items_delivery_order_id_fkey FOREIGN KEY (delivery_order_id) REFERENCES public.sal_delivery_orders(id) ON DELETE CASCADE;


--
-- Name: sal_delivery_orders sal_delivery_orders_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_delivery_orders
    ADD CONSTRAINT sal_delivery_orders_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.sal_drivers(id) ON DELETE SET NULL;


--
-- Name: sal_delivery_orders sal_delivery_orders_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_delivery_orders
    ADD CONSTRAINT sal_delivery_orders_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.sal_vehicles(id) ON DELETE SET NULL;


--
-- Name: sal_order_items sal_order_items_sales_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_order_items
    ADD CONSTRAINT sal_order_items_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sal_sales_orders(id) ON DELETE CASCADE;


--
-- Name: sal_price_items sal_price_items_price_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_price_items
    ADD CONSTRAINT sal_price_items_price_book_id_fkey FOREIGN KEY (price_book_id) REFERENCES public.sal_price_books(id) ON DELETE CASCADE;


--
-- Name: sal_receipts sal_receipts_delivery_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_receipts
    ADD CONSTRAINT sal_receipts_delivery_item_id_fkey FOREIGN KEY (delivery_item_id) REFERENCES public.sal_delivery_order_items(id);


--
-- Name: sal_receipts sal_receipts_delivery_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_receipts
    ADD CONSTRAINT sal_receipts_delivery_order_id_fkey FOREIGN KEY (delivery_order_id) REFERENCES public.sal_delivery_orders(id);


--
-- Name: sal_return_items sal_return_items_return_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_return_items
    ADD CONSTRAINT sal_return_items_return_order_id_fkey FOREIGN KEY (return_order_id) REFERENCES public.sal_return_orders(id);


--
-- Name: sys_organizations sys_organizations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_organizations
    ADD CONSTRAINT sys_organizations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.sys_organizations(id);


--
-- Name: sys_permission_set sys_permission_set_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permission_set
    ADD CONSTRAINT sys_permission_set_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.sys_user(user_id) ON DELETE SET NULL;


--
-- Name: sys_permission_set_item sys_permission_set_item_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permission_set_item
    ADD CONSTRAINT sys_permission_set_item_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.sys_menu(menu_id) ON DELETE CASCADE;


--
-- Name: sys_permission_set_item sys_permission_set_item_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_permission_set_item
    ADD CONSTRAINT sys_permission_set_item_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sys_permission_set(set_id) ON DELETE CASCADE;


--
-- Name: sys_role_menu_permission sys_role_menu_permission_menu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_menu_permission
    ADD CONSTRAINT sys_role_menu_permission_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.sys_menu(menu_id) ON DELETE CASCADE;


--
-- Name: sys_role_menu_permission sys_role_menu_permission_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_menu_permission
    ADD CONSTRAINT sys_role_menu_permission_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.sys_role(role_id) ON DELETE CASCADE;


--
-- Name: sys_role_permission_set sys_role_permission_set_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_permission_set
    ADD CONSTRAINT sys_role_permission_set_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.sys_role(role_id) ON DELETE CASCADE;


--
-- Name: sys_role_permission_set sys_role_permission_set_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_role_permission_set
    ADD CONSTRAINT sys_role_permission_set_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sys_permission_set(set_id) ON DELETE CASCADE;


--
-- Name: sys_user_orgs sys_user_orgs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_orgs
    ADD CONSTRAINT sys_user_orgs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.sys_organizations(id) ON DELETE CASCADE;


--
-- Name: sys_user_permission_set sys_user_permission_set_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_permission_set
    ADD CONSTRAINT sys_user_permission_set_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.sys_user(user_id) ON DELETE SET NULL;


--
-- Name: sys_user_permission_set sys_user_permission_set_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_permission_set
    ADD CONSTRAINT sys_user_permission_set_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.sys_permission_set(set_id) ON DELETE CASCADE;


--
-- Name: sys_user_permission_set sys_user_permission_set_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_permission_set
    ADD CONSTRAINT sys_user_permission_set_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.sys_user(user_id) ON DELETE CASCADE;


--
-- Name: sys_user_role sys_user_role_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_role
    ADD CONSTRAINT sys_user_role_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.sys_user(user_id);


--
-- Name: sys_user_role sys_user_role_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_role
    ADD CONSTRAINT sys_user_role_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.sys_role(role_id) ON DELETE CASCADE;


--
-- Name: sys_user_role sys_user_role_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_user_role
    ADD CONSTRAINT sys_user_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.sys_user(user_id) ON DELETE CASCADE;


--
-- Name: uat_feedbacks uat_feedbacks_pilot_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uat_feedbacks
    ADD CONSTRAINT uat_feedbacks_pilot_run_id_fkey FOREIGN KEY (pilot_run_id) REFERENCES public.uat_pilot_runs(id);


--
-- Name: wf_cc_task wf_cc_task_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_cc_task
    ADD CONSTRAINT wf_cc_task_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.wf_instance(id) ON DELETE CASCADE;


--
-- Name: wf_definition_version wf_definition_version_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_definition_version
    ADD CONSTRAINT wf_definition_version_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.wf_definition(id) ON DELETE CASCADE;


--
-- Name: wf_definition_version wf_definition_version_form_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_definition_version
    ADD CONSTRAINT wf_definition_version_form_version_id_fkey FOREIGN KEY (form_version_id) REFERENCES public.wf_form_version(id);


--
-- Name: wf_form_version wf_form_version_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_form_version
    ADD CONSTRAINT wf_form_version_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.wf_form_definition(id) ON DELETE CASCADE;


--
-- Name: wf_instance wf_instance_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_instance
    ADD CONSTRAINT wf_instance_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.wf_definition(id);


--
-- Name: wf_instance wf_instance_definition_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_instance
    ADD CONSTRAINT wf_instance_definition_version_id_fkey FOREIGN KEY (definition_version_id) REFERENCES public.wf_definition_version(id);


--
-- Name: wf_instance wf_instance_form_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_instance
    ADD CONSTRAINT wf_instance_form_version_id_fkey FOREIGN KEY (form_version_id) REFERENCES public.wf_form_version(id);


--
-- Name: wf_instance_variable wf_instance_variable_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_instance_variable
    ADD CONSTRAINT wf_instance_variable_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.wf_instance(id) ON DELETE CASCADE;


--
-- Name: wf_task_action wf_task_action_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_task_action
    ADD CONSTRAINT wf_task_action_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.wf_instance(id) ON DELETE CASCADE;


--
-- Name: wf_task_action wf_task_action_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_task_action
    ADD CONSTRAINT wf_task_action_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.wf_task(id) ON DELETE SET NULL;


--
-- Name: wf_task wf_task_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wf_task
    ADD CONSTRAINT wf_task_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.wf_instance(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict CyeVcTlLCQM53g9eRiArVe5ojMPHeh2yIPTsDh7TWG3TT7gOYRMIvq2NrR1gMNk

