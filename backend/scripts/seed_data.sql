--
-- PostgreSQL database dump
--

-- Dumped from database version 16.9 (Ubuntu 16.9-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.9 (Ubuntu 16.9-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.departments DISABLE TRIGGER ALL;



ALTER TABLE public.departments ENABLE TRIGGER ALL;

--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.employees DISABLE TRIGGER ALL;



ALTER TABLE public.employees ENABLE TRIGGER ALL;

--
-- Data for Name: activities; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.activities DISABLE TRIGGER ALL;



ALTER TABLE public.activities ENABLE TRIGGER ALL;

--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.teams DISABLE TRIGGER ALL;



ALTER TABLE public.teams ENABLE TRIGGER ALL;

--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.projects DISABLE TRIGGER ALL;



ALTER TABLE public.projects ENABLE TRIGGER ALL;

--
-- Data for Name: project_members; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.project_members DISABLE TRIGGER ALL;



ALTER TABLE public.project_members ENABLE TRIGGER ALL;

--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.tasks DISABLE TRIGGER ALL;



ALTER TABLE public.tasks ENABLE TRIGGER ALL;

--
-- Data for Name: task_comments; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.task_comments DISABLE TRIGGER ALL;



ALTER TABLE public.task_comments ENABLE TRIGGER ALL;

--
-- Name: activities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.activities_id_seq', 1, false);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.departments_id_seq', 1, false);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employees_id_seq', 1, true);


--
-- Name: project_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.project_members_id_seq', 1, false);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.projects_id_seq', 1, false);


--
-- Name: task_comments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.task_comments_id_seq', 1, false);


--
-- Name: tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tasks_id_seq', 1, false);


--
-- Name: teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.teams_id_seq', 1, false);


--
-- PostgreSQL database dump complete
--

